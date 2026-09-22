-- Cola de actualizaciones pedidas desde el armador. Ninguna escritura pública directa.
create table if not exists public.requested_offer_refreshes (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  requester_hash text not null,
  targets jsonb not null check (jsonb_typeof(targets) = 'array' and jsonb_array_length(targets) between 1 and 8),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 minutes',
  lease_token uuid
);
create index if not exists requested_offer_refreshes_queue_idx on public.requested_offer_refreshes (status, created_at);
create index if not exists requested_offer_refreshes_requester_idx on public.requested_offer_refreshes (requester_hash, created_at);
create index if not exists requested_offer_refreshes_fingerprint_idx on public.requested_offer_refreshes (fingerprint, created_at desc);
alter table public.requested_offer_refreshes enable row level security;
revoke all on public.requested_offer_refreshes from public, anon, authenticated;
grant select, insert, update, delete on public.requested_offer_refreshes to service_role;

create or replace function public.request_offer_refresh(p_targets jsonb, p_requester_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare target jsonb; canonical jsonb; fingerprint_value text; job public.requested_offer_refreshes;
begin
  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) not between 1 and 8
    or p_requester_hash is null or p_requester_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_REFRESH_REQUEST'; end if;
  for target in select * from jsonb_array_elements(p_targets) loop
    if jsonb_typeof(target) is distinct from 'object' or not (target ?& array['productId','storeId','url'])
      or length(target->>'productId') not between 1 and 240 or length(target->>'storeId') not between 1 and 80
      or length(target->>'url') not between 1 and 2048 then raise exception 'INVALID_REFRESH_REQUEST'; end if;
    if not exists (select 1 from public.product_prices pp join public.products p on p.id = pp.product_id
      where pp.product_id = target->>'productId' and pp.store_id = target->>'storeId' and pp.url = target->>'url'
      and p.category in ('procesadores','tarjetas-graficas','motherboards','memoria-ram','almacenamiento','fuentes-alimentacion','gabinetes','refrigeracion'))
    then raise exception 'REFRESH_OFFER_NOT_FOUND'; end if;
  end loop;
  select jsonb_agg(t order by t->>'productId', t->>'storeId', t->>'url') into canonical
    from (select distinct jsonb_build_object('productId', x->>'productId', 'storeId', x->>'storeId', 'url', x->>'url') t from jsonb_array_elements(p_targets) x) normalized;
  fingerprint_value := md5(canonical::text);
  -- Dedupe y límites bajo una sola transacción, compartidos entre todos los Workers.
  perform pg_advisory_xact_lock(819726521);
  update public.requested_offer_refreshes set status = 'failed', finished_at = now()
    where status in ('queued','running') and expires_at <= now();
  select * into job from public.requested_offer_refreshes where fingerprint = fingerprint_value
    and ((status in ('queued','running') and expires_at > now()) or (status in ('completed','partial') and finished_at > now() - interval '3 minutes'))
    order by created_at desc limit 1;
  if found then return to_jsonb(job) - array['requester_hash','fingerprint','lease_token']; end if;
  if (select count(*) from public.requested_offer_refreshes where requester_hash = p_requester_hash and created_at > now() - interval '10 minutes') >= 3
    or (select count(*) from public.requested_offer_refreshes where created_at > now() - interval '10 minutes') >= 12
    or (select count(*) from public.requested_offer_refreshes where created_at > now() - interval '24 hours') >= 100
  then raise exception 'REFRESH_RATE_LIMIT'; end if;
  insert into public.requested_offer_refreshes (fingerprint, requester_hash, targets) values (fingerprint_value, p_requester_hash, canonical) returning * into job;
  return to_jsonb(job) - array['requester_hash','fingerprint','lease_token'];
end $$;

create or replace function public.claim_offer_refresh()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare job public.requested_offer_refreshes;
begin
  update public.requested_offer_refreshes set status = 'failed', finished_at = now() where status in ('queued','running') and expires_at <= now();
  delete from public.requested_offer_refreshes where created_at < now() - interval '7 days';
  select * into job from public.requested_offer_refreshes where status = 'queued' order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.requested_offer_refreshes set status = 'running', started_at = now(), expires_at = now() + interval '10 minutes', lease_token = gen_random_uuid()
    where id = job.id returning * into job;
  return to_jsonb(job) - array['requester_hash','fingerprint'];
end $$;

create or replace function public.persist_requested_offer(
  p_job_id uuid, p_lease_token uuid, p_product_id text, p_store_id text, p_url text,
  p_price numeric, p_original_price numeric, p_stock text, p_installment_count integer, p_installment_amount numeric,
  p_observed_at timestamptz, p_review jsonb, p_signature text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare previous public.product_prices; job public.requested_offer_refreshes;
begin
  select * into job from public.requested_offer_refreshes where id = p_job_id for update;
  if not found or job.status <> 'running' or job.lease_token is distinct from p_lease_token or job.expires_at <= now() then return false; end if;
  if not exists (select 1 from jsonb_array_elements(job.targets) t where t->>'productId' = p_product_id and t->>'storeId' = p_store_id and t->>'url' = p_url) then return false; end if;
  if p_price is null or p_price <= 0 or p_price::text in ('NaN','Infinity','-Infinity')
    or p_stock is null or p_stock not in ('in-stock','low-stock','out-of-stock')
    or p_observed_at is null or p_observed_at < job.started_at or p_observed_at > now() + interval '1 minute' then return false; end if;
  select * into previous from public.product_prices where product_id = p_product_id and store_id = p_store_id and url = p_url for update;
  if not found or previous.last_updated > p_observed_at then return false; end if;
  if previous.price is distinct from p_price or previous.original_price is distinct from p_original_price or previous.stock is distinct from p_stock then
    insert into public.price_history (product_id, store_id, offer_url, price, original_price, stock, recorded_at)
      values (p_product_id, p_store_id, p_url, p_price, p_original_price, p_stock, p_observed_at);
  end if;
  update public.product_prices set price = p_price, original_price = p_original_price, stock = p_stock,
    installment_count = p_installment_count, installment_amount = p_installment_amount, last_updated = p_observed_at,
    identity_review = coalesce(p_review, identity_review), state_signature = p_signature, updated_at = now()
    where product_id = p_product_id and store_id = p_store_id and url = p_url;
  return true;
end $$;

revoke all on function public.request_offer_refresh(jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_offer_refresh() from public, anon, authenticated;
revoke all on function public.persist_requested_offer(uuid, uuid, text, text, text, numeric, numeric, text, integer, numeric, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.request_offer_refresh(jsonb, text) to service_role;
grant execute on function public.claim_offer_refresh() to service_role;
grant execute on function public.persist_requested_offer(uuid, uuid, text, text, text, numeric, numeric, text, integer, numeric, timestamptz, jsonb, text) to service_role;
