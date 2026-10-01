-- Evitar consultar productos una vez por cada oferta al elegir cada lote.
alter table public.catalog_offer_refresh_state add column category text;
update public.catalog_offer_refresh_state q set category=p.category
  from public.product_prices pp join public.products p on p.id=pp.product_id where q.offer_id=pp.id;
create or replace function public.seed_catalog_refresh_queue() returns integer
language plpgsql security invoker set search_path=pg_catalog,public set jit=off as $$
declare changed integer;
begin
 insert into public.catalog_offer_refresh_state(offer_id,category)
 select pp.id,p.category from public.product_prices pp join public.products p on p.id=pp.product_id
 on conflict(offer_id) do update set category=excluded.category
 where catalog_offer_refresh_state.category is distinct from excluded.category;
 get diagnostics changed=row_count;
 return changed;
end $$;
create or replace view public.catalog_refresh_policy with (security_invoker = true) as
with tracked as (
  select product_id from public.user_favorites
  union select product_id from public.price_alerts where is_active = true
)
select pp.id offer_id, pp.product_id, pp.store_id, pp.url, pp.last_updated,
  case when t.product_id is not null then 3
    when coalesce(i.view_users,0) >= 5 or coalesce(i.outbound_users,0) >= 2 then 24
    when q.category in ('procesadores','tarjetas-graficas','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion') then 24
    when q.category in ('gabinetes','refrigeracion') then 72 else 168 end interval_hours,
  case when t.product_id is not null then 'tracked'
    when coalesce(i.view_users,0) >= 5 or coalesce(i.outbound_users,0) >= 2 then 'analytics'
    when q.category in ('procesadores','tarjetas-graficas','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion') then 'components'
    when q.category in ('gabinetes','refrigeracion') then 'build-support' else 'maintenance' end reason,
  q.last_attempt_at, q.next_attempt_at, q.leased_until
from public.product_prices pp
join public.stores s on s.id = pp.store_id and s.is_active = true
left join tracked t on t.product_id = pp.product_id
left join public.catalog_refresh_interest i on i.product_id = pp.product_id and i.expires_at > now()
left join public.catalog_offer_refresh_state q on q.offer_id = pp.id;

analyze public.catalog_offer_refresh_state;

-- El precio puede estar observado aunque la tienda no informe disponibilidad.
-- Stock desconocido nunca se convierte en oferta comprable por esa observación.
alter table public.product_prices add column source_identity jsonb;
alter table public.product_prices add column price_condition text check(price_condition in ('special','unspecified'));
create function public.persist_adaptive_offer(
  p_offer_id uuid,p_token uuid,p_price numeric,p_original_price numeric,p_stock text,
  p_installment_count integer,p_installment_amount numeric,
  p_run_started_at timestamptz,p_observed_at timestamptz,
  p_review jsonb,p_signature text,p_source_identity jsonb,p_price_condition text
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare previous public.product_prices; product_key text;
begin
 if p_run_started_at is null or p_run_started_at < now()-interval '30 minutes' or p_run_started_at>now()
   or p_observed_at is null or p_observed_at<p_run_started_at or p_observed_at>now()+interval '1 minute'
   or p_price is null or p_price<=0 or p_price::text in ('NaN','Infinity','-Infinity')
   or p_stock is null or p_stock not in ('in-stock','low-stock','out-of-stock','unknown')
   or p_price_condition is null or p_price_condition not in ('special','unspecified')
   or not coalesce(jsonb_typeof(p_source_identity)='object'
     and jsonb_typeof(p_source_identity->'title')='string' and length(trim(p_source_identity->>'title')) between 1 and 400
     and jsonb_typeof(p_source_identity->'listingRef')='string' and length(p_source_identity->>'listingRef') between 1 and 2048,false)
   then return false; end if;
 select product_id into product_key from public.product_prices where id=p_offer_id;
 if not found then return false; end if;
 -- Mismo orden de bloqueo que el read model y las observaciones prioritarias.
 perform 1 from public.products where id=product_key for update;
 select * into previous from public.product_prices where id=p_offer_id for update;
 if not found or previous.last_updated>p_observed_at then return false; end if;
 perform 1 from public.catalog_offer_refresh_state
   where offer_id=p_offer_id and lease_token=p_token and leased_until>now() for update;
 if not found then return false; end if;
 if p_price_condition='special' and previous.store_id<>'compragamer' then return false; end if;
 if previous.price is distinct from p_price or previous.original_price is distinct from p_original_price or previous.stock is distinct from p_stock then
   insert into public.price_history(product_id,store_id,offer_url,price,original_price,stock,recorded_at)
     values(previous.product_id,previous.store_id,previous.url,p_price,p_original_price,p_stock,p_observed_at);
 end if;
 update public.product_prices set price=p_price,original_price=p_original_price,stock=p_stock,
   installment_count=p_installment_count,installment_amount=p_installment_amount,last_updated=p_observed_at,
   identity_review=coalesce(p_review,identity_review),state_signature=p_signature,source_identity=p_source_identity,
   price_condition=p_price_condition,updated_at=now() where id=p_offer_id;
 update public.products set last_scraped_at=greatest(coalesce(last_scraped_at,p_observed_at),p_observed_at) where id=product_key;
 return true;
end $$;
revoke all on function public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text) to service_role;
