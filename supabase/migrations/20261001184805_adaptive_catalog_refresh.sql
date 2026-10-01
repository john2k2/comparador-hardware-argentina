-- Cola privada del catálogo completo. La frecuencia no equivale a una promesa
-- de disponibilidad; solamente observaciones reales actualizan product_prices.
create table public.catalog_refresh_interest (
  product_id text primary key references public.products(id) on delete cascade,
  view_users integer not null default 0 check (view_users between 0 and 10000000),
  outbound_users integer not null default 0 check (outbound_users between 0 and 10000000),
  period_start date not null, period_end date not null,
  imported_at timestamptz not null default now(), expires_at timestamptz not null,
  check (period_end >= period_start and period_end - period_start <= 28),
  check (expires_at > imported_at and expires_at <= imported_at + interval '8 days')
);
create table public.catalog_offer_refresh_state (
  offer_id uuid primary key references public.product_prices(id) on delete cascade,
  last_attempt_at timestamptz, next_attempt_at timestamptz not null default '-infinity',
  failures integer not null default 0 check (failures between 0 and 100),
  lease_token uuid, leased_until timestamptz,
  last_result text check (last_result in ('observed','no-observation','source-failed','persist-failed','unsupported')),
  check ((lease_token is null) = (leased_until is null))
);
create index catalog_offer_refresh_retry_idx on public.catalog_offer_refresh_state(next_attempt_at, leased_until);
create table public.catalog_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','deadline','failed')),
  summary jsonb not null default '{}'
);
alter table public.catalog_refresh_interest enable row level security;
alter table public.catalog_offer_refresh_state enable row level security;
alter table public.catalog_refresh_runs enable row level security;
revoke all on public.catalog_refresh_interest, public.catalog_offer_refresh_state, public.catalog_refresh_runs from public, anon, authenticated;
grant all on public.catalog_refresh_interest, public.catalog_offer_refresh_state, public.catalog_refresh_runs to service_role;

-- Una vista sin privilegios elevados permite medir toda la cobertura; no se
-- publica ni contiene usuarios, identificadores de sesión o términos de búsqueda.
create view public.catalog_refresh_policy with (security_invoker = true) as
with tracked as (
  select product_id from public.user_favorites
  union select product_id from public.price_alerts where is_active = true
)
select pp.id offer_id, pp.product_id, pp.store_id, pp.url, pp.last_updated,
  case when t.product_id is not null then 3
    when coalesce(i.view_users,0) >= 5 or coalesce(i.outbound_users,0) >= 2 then 24
    when p.category in ('procesadores','tarjetas-graficas','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion') then 24
    when p.category in ('gabinetes','refrigeracion') then 72 else 168 end interval_hours,
  case when t.product_id is not null then 'tracked'
    when coalesce(i.view_users,0) >= 5 or coalesce(i.outbound_users,0) >= 2 then 'analytics'
    when p.category in ('procesadores','tarjetas-graficas','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion') then 'components'
    when p.category in ('gabinetes','refrigeracion') then 'build-support' else 'maintenance' end reason,
  q.last_attempt_at, q.next_attempt_at, q.leased_until
from public.product_prices pp
join public.products p on p.id = pp.product_id
join public.stores s on s.id = pp.store_id and s.is_active = true
left join tracked t on t.product_id = pp.product_id
left join public.catalog_refresh_interest i on i.product_id = pp.product_id and i.expires_at > now()
left join public.catalog_offer_refresh_state q on q.offer_id = pp.id;
revoke all on public.catalog_refresh_policy from public, anon, authenticated;
grant select on public.catalog_refresh_policy to service_role;

create function public.seed_catalog_refresh_queue() returns integer
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare inserted integer;
begin
  insert into public.catalog_offer_refresh_state(offer_id)
    select id from public.product_prices on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- Rotación por tienda y 25% reservado a mantenimiento. SKIP LOCKED y lease
-- permiten reanudar procesos interrumpidos sin repetir un lote simultáneamente.
create function public.claim_catalog_refresh(p_token uuid, p_limit integer default 24)
returns table(offer_id uuid, product_id text, store_id text, url text, interval_hours integer, reason text)
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_token is null or p_limit < 1 or p_limit > 60 then raise exception 'REFRESH_INVALID_CLAIM'; end if;
  return query
  with due as materialized (
    select v.*, row_number() over (partition by v.store_id, (v.interval_hours > 24)
      order by v.last_attempt_at nulls first, v.last_updated nulls first, v.offer_id) store_rank
    from public.catalog_refresh_policy v
    where coalesce(v.next_attempt_at,'-infinity'::timestamptz) <= now()
      and coalesce(v.leased_until,'-infinity'::timestamptz) <= now()
      and (v.last_updated is null or v.last_updated <= now() - make_interval(hours => v.interval_hours))
  ), maintenance as (
    select d.offer_id from due d where d.interval_hours > 24
    order by d.store_rank, d.last_attempt_at nulls first, d.last_updated nulls first, d.offer_id
    limit greatest(1, p_limit / 4)
  ), candidates as (
    select d.* from due d
    order by (d.offer_id in (select m.offer_id from maintenance m)) desc,
      (d.interval_hours <= 24) desc, d.store_rank, d.last_attempt_at nulls first, d.offer_id
    limit p_limit
  ), locked as (
    select q.offer_id from public.catalog_offer_refresh_state q join candidates c on c.offer_id = q.offer_id
    where coalesce(q.leased_until,'-infinity'::timestamptz) <= now()
    order by q.offer_id for update of q skip locked
  ), claimed as (
    update public.catalog_offer_refresh_state q set lease_token = p_token, leased_until = now() + interval '20 minutes'
    from locked l where q.offer_id = l.offer_id returning q.offer_id
  )
  select c.offer_id,c.product_id,c.store_id,c.url,c.interval_hours,c.reason
    from candidates c join claimed cl on cl.offer_id = c.offer_id
    order by c.store_rank, c.offer_id;
end $$;

create function public.finish_catalog_refresh(p_offer_id uuid, p_token uuid, p_result text) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_result is null or p_result not in ('observed','no-observation','source-failed','persist-failed','unsupported') then return false; end if;
  update public.catalog_offer_refresh_state q set last_attempt_at = now(),
    last_result = p_result, failures = case when p_result = 'observed' then 0 else least(q.failures+1,100) end,
    next_attempt_at = case when p_result = 'observed' then '-infinity'::timestamptz
      else now() + make_interval(hours => least(24, power(2,least(q.failures,5))::integer)) end,
    lease_token = null, leased_until = null
    where q.offer_id = p_offer_id and q.lease_token = p_token and q.leased_until > now();
  return found;
end $$;

create function public.catalog_refresh_coverage() returns jsonb
language sql stable security invoker set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from (
    select store_id, reason, interval_hours, count(*) total,
      count(*) filter (where last_updated between now()-interval '3 hours' and now()+interval '1 minute') observed_3h,
      count(*) filter (where last_updated between now()-interval '24 hours' and now()+interval '1 minute') observed_24h,
      count(*) filter (where last_updated between now()-make_interval(hours=>interval_hours) and now()+interval '1 minute') within_policy,
      count(*) filter (where last_attempt_at is null) never_attempted,
      min(last_attempt_at) oldest_attempt_at, min(last_updated) oldest_observation_at
    from public.catalog_refresh_policy group by store_id, reason, interval_hours order by store_id, reason
  ) g;
$$;
revoke all on function public.seed_catalog_refresh_queue() from public, anon, authenticated;
revoke all on function public.claim_catalog_refresh(uuid,integer) from public, anon, authenticated;
revoke all on function public.finish_catalog_refresh(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.catalog_refresh_coverage() from public, anon, authenticated;
grant execute on function public.seed_catalog_refresh_queue(), public.claim_catalog_refresh(uuid,integer),
  public.finish_catalog_refresh(uuid,uuid,text), public.catalog_refresh_coverage() to service_role;
