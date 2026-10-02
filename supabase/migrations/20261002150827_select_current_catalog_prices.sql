-- Identidad corroborada se calcula al escribir. La ventana se evalúa al leer,
-- sin renovar observaciones ni esconder historial y antes de elegir por tienda.
begin;
alter table public.catalog_price_summaries
 add column comparable_initialized boolean not null default false,
 add column comparable_offers jsonb not null default '[]'::jsonb,
 add column comparable_stats jsonb,
 add column comparable_valid_until timestamptz,
 add column comparable_latest_observed_at timestamptz;

create function public.catalog_current_price_stats(p_offers jsonb,p_stores text[] default '{}')
returns table(lowest numeric,highest numeric,average numeric,available bigint,urls text,offer_ids uuid[])
language sql stable parallel safe security invoker set search_path=pg_catalog,public as $$
 with current as (
  select distinct on(lower(store_id)) id,store_id,price,stock,url,last_updated
  from jsonb_to_recordset(coalesce(p_offers,'[]')) o(id uuid,store_id text,price numeric,stock text,url text,last_updated timestamptz)
  where last_updated between now()-interval '24 hours' and now()+interval '1 minute'
   and (coalesce(cardinality(p_stores),0)=0 or lower(store_id)=any(p_stores))
  order by lower(store_id),price,last_updated desc,url
 ) select s.* from public.catalog_price_stats((select coalesce(jsonb_agg(to_jsonb(o)),'[]') from current o)) s;
$$;
revoke all on function public.catalog_current_price_stats(jsonb,text[]) from public;
grant execute on function public.catalog_current_price_stats(jsonb,text[]) to anon,authenticated,service_role;


create function public.sync_catalog_comparable_summary(p_product text)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare offers jsonb; stats record; latest_at timestamptz; expires_at timestamptz; observed_at timestamptz;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',lower(o.store_id),'price',o.price,'stock',o.stock,'url',o.url,'last_updated',o.last_updated) order by o.store_id,o.price,o.id),'[]')
 into offers from public.product_prices o join public.products p on p.id=o.product_id
 where o.product_id=p_product and public.catalog_offer_is_comparable(o.price,o.stock,o.url,o.identity_review,p.name,p.category,o.source_identity,o.store_id);
 select * into stats from public.catalog_current_price_stats(offers);
 select max(last_updated),case when bool_or(last_updated>now()+interval '1 minute') then now()
   else min(last_updated+interval '24 hours') filter(where last_updated>=now()-interval '24 hours') end,
   max(last_updated) filter(where id=any(stats.offer_ids))
 into latest_at,expires_at,observed_at
 from jsonb_to_recordset(offers) o(id uuid,last_updated timestamptz);
 update public.catalog_price_summaries set comparable_initialized=true,comparable_offers=offers,
  comparable_stats=case when stats.lowest is not null then to_jsonb(stats)||jsonb_build_object('observed_at',observed_at) end,
  comparable_valid_until=expires_at,comparable_latest_observed_at=latest_at where product_id=p_product;
end $$;
create function public.trigger_catalog_comparable_summary()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare product_key text;
begin
 if tg_table_name='product_prices' then
  for product_key in select distinct key from unnest(array[case when tg_op<>'INSERT' then old.product_id end,case when tg_op<>'DELETE' then new.product_id end]) key where key is not null order by key loop
   perform public.sync_catalog_comparable_summary(product_key);
  end loop;
 elsif tg_table_name='products' then perform public.sync_catalog_comparable_summary(new.id);
 elsif old.url is distinct from new.url then
  for product_key in select distinct product_id from public.product_prices where store_id=new.id order by product_id loop
   perform public.sync_catalog_comparable_summary(product_key);
  end loop;
 end if;
 return null;
end $$;
-- Alfabéticamente posterior al trigger del resumen histórico; comparte su lock.
create trigger product_prices_usable_summary after insert or update or delete on public.product_prices
for each row execute function public.trigger_catalog_comparable_summary();
create trigger products_usable_summary after update of name,category on public.products
for each row when(old.name is distinct from new.name or old.category is distinct from new.category) execute function public.trigger_catalog_comparable_summary();
create trigger stores_usable_summary after update of url on public.stores
for each row when(old.url is distinct from new.url) execute function public.trigger_catalog_comparable_summary();
revoke all on function public.sync_catalog_comparable_summary(text),public.trigger_catalog_comparable_summary() from public,anon,authenticated;
grant execute on function public.sync_catalog_comparable_summary(text) to service_role;
-- Backfill online acotado: mismo orden de locks que los escritores, sin DDL
-- bloqueante durante la reconstrucción de todos los agregados.
create function public.initialize_catalog_comparable_summaries(p_limit integer default 1000)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public set jit=off as $$
declare product_key text; processed integer:=0; started timestamptz:=clock_timestamp(); pending bigint;
begin
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'CATALOG_INVALID_BACKFILL_LIMIT'; end if;
 for product_key in select product_id from public.catalog_price_summaries where not comparable_initialized order by product_id limit p_limit loop
  exit when clock_timestamp()-started>=interval '20 seconds';
  perform 1 from public.products where id=product_key for update skip locked;
  if not found then continue; end if;
  perform public.sync_catalog_comparable_summary(product_key);
  processed:=processed+1;
 end loop;
 select count(*) into pending from public.catalog_price_summaries where not comparable_initialized;
 return jsonb_build_object('processed',processed,'remaining',pending,'elapsedMs',round(extract(epoch from(clock_timestamp()-started))*1000));
end $$;
revoke all on function public.initialize_catalog_comparable_summaries(integer) from public,anon,authenticated;
grant execute on function public.initialize_catalog_comparable_summaries(integer) to service_role;
commit;
