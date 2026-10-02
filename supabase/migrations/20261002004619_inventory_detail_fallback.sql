-- La API de Katech descubre presencia; sus precios requieren la ficha visible.
create or replace function public.claim_catalog_inventory(p_store_id text,p_token uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_token is null or p_store_id not in ('compragamer','maxtecno','katech','dinobyte','goldentechstore') then return false; end if;
 insert into public.catalog_inventory_sources(store_id) values(p_store_id) on conflict do nothing;
 update public.catalog_inventory_sources set lease_token=p_token,leased_until=now()+interval '17 minutes',last_attempt_at=now()
 where store_id=p_store_id and next_attempt_at<=now() and coalesce(leased_until,'-infinity')<=now();
 return found;
end $$;
alter table public.catalog_inventory_listings
 add column detail_lease_token uuid, add column detail_leased_until timestamptz,
 add column detail_started_at timestamptz, add column last_detail_attempt_at timestamptz,
 add column detail_last_completion_token uuid,
 add column next_detail_at timestamptz not null default '-infinity',
 add constraint inventory_detail_lease_check check((detail_lease_token is null)=(detail_leased_until is null));
create index product_prices_inventory_reference_idx on public.product_prices
 (store_id,(regexp_replace(regexp_replace(url,'^https://www[.]','https://'),'/$','')));
create function public.claim_catalog_inventory_details(p_token uuid,p_limit integer default 48)
returns table(store_id text,source_id text,url text,title text)
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_token is null or p_limit<1 or p_limit>60 then raise exception 'REFRESH_INVALID_DETAIL_CLAIM'; end if;
 return query with candidates as (
 select l.store_id,l.source_id from public.catalog_inventory_listings l
 join public.catalog_inventory_sources s on s.store_id=l.store_id and s.last_scan_token=l.scan_token
 where l.product_id is null and l.store_id='katech' and s.last_success_at>now()-interval '72 hours'
 and not exists(select 1 from public.product_prices pp where pp.store_id=l.store_id
  and regexp_replace(regexp_replace(pp.url,'^https://www[.]','https://'),'/$','')=regexp_replace(regexp_replace(l.url,'^https://www[.]','https://'),'/$',''))
 and l.next_detail_at<=now() and coalesce(l.detail_leased_until,'-infinity')<=now()
 order by (l.title ~* '^(micro|procesador|cpu|memoria|ram|mother|placa de video|tarjeta grafica|ssd|disco|fuente)') desc,
 l.last_detail_attempt_at nulls first,l.source_id
 limit p_limit for update of l skip locked
 ), claimed as (
 update public.catalog_inventory_listings l set detail_lease_token=p_token,detail_leased_until=now()+interval '10 minutes',detail_started_at=now()
 from candidates c where l.store_id=c.store_id and l.source_id=c.source_id returning l.store_id,l.source_id,l.url,l.title
 ) select c.store_id,c.source_id,c.url,c.title from claimed c order by c.source_id;
end $$;
create function public.finish_catalog_inventory_detail(p_store_id text,p_source_id text,p_token uuid,p_product_id text) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_product_id is not null and not exists(select 1 from public.catalog_inventory_listings l join public.product_prices pp
 on pp.store_id=l.store_id and pp.url=l.url and pp.product_id=p_product_id
 where l.store_id=p_store_id and l.source_id=p_source_id and pp.last_updated>=l.detail_started_at) then return false; end if;
 update public.catalog_inventory_listings set product_id=coalesce(p_product_id,product_id),last_detail_attempt_at=now(),
 next_detail_at=now()+interval '1 hour',detail_lease_token=null,detail_leased_until=null
 ,detail_last_completion_token=p_token
 where store_id=p_store_id and source_id=p_source_id and detail_lease_token=p_token and detail_leased_until>now();
 if found then return true; end if;
 return exists(select 1 from public.catalog_inventory_listings where store_id=p_store_id and source_id=p_source_id
   and detail_last_completion_token=p_token and product_id is not distinct from p_product_id);
end $$;
revoke all on function public.claim_catalog_inventory_details(uuid,integer),public.finish_catalog_inventory_detail(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_catalog_inventory_details(uuid,integer),public.finish_catalog_inventory_detail(text,text,uuid,text) to service_role;

-- Rotar fuentes con lectura compartida contrastada sin ampliar el presupuesto total.
-- Evitar JIT y ordenar sólo columnas pequeñas, no las URLs del catálogo.
create or replace function public.claim_catalog_feed_refresh(p_token uuid, p_limit integer default 24)
returns table(offer_id uuid, product_id text, store_id text, url text, interval_hours integer, reason text)
language plpgsql security invoker set search_path = pg_catalog, public set jit = off set work_mem = '32MB' as $$
begin
  if p_token is null or p_limit < 1 or p_limit > 60 then raise exception 'REFRESH_INVALID_CLAIM'; end if;
  return query
  with due as materialized (
    select v.offer_id,v.store_id,v.interval_hours,v.reason,v.last_attempt_at,v.last_updated, row_number() over (partition by v.store_id, (v.interval_hours > 24)
      order by v.last_attempt_at nulls first, v.last_updated nulls first, v.offer_id) store_rank
    from public.catalog_refresh_policy v
    where v.store_id in ('compragamer','maxtecno','dinobyte','goldentechstore')
      and coalesce(v.next_attempt_at,'-infinity'::timestamptz) <= now()
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
  select c.offer_id,pp.product_id,c.store_id,pp.url,c.interval_hours,c.reason
    from candidates c join claimed cl on cl.offer_id = c.offer_id
    join public.product_prices pp on pp.id=c.offer_id
    order by c.store_rank, c.offer_id;
end $$;

REVOKE ALL ON FUNCTION public.claim_catalog_feed_refresh(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_catalog_feed_refresh(uuid,integer) TO service_role;
