-- Reversión del borrador 02: definiciones exactas de 20260930133000 (histórico) y
-- 20261002150827 (comparable) y sus dos triggers combinados sin WHEN.
-- No cambia datos: los resúmenes se recalculan en la siguiente escritura de cada oferta.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP TRIGGER IF EXISTS product_prices_catalog_summary_update ON public.product_prices;
DROP TRIGGER IF EXISTS product_prices_usable_summary_update ON public.product_prices;
DROP TRIGGER IF EXISTS product_prices_catalog_summary ON public.product_prices;
DROP TRIGGER IF EXISTS product_prices_usable_summary ON public.product_prices;

create or replace function public.sync_catalog_price_summary()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare product_key text; offers jsonb; stores text[];
begin
  for product_key in select distinct key from unnest(array[
    case when tg_op<>'INSERT' then old.product_id end,
    case when tg_op<>'DELETE' then new.product_id end
  ]) key where key is not null order by key loop
    perform 1 from public.products where id=product_key for update;
    if not found then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',lower(o.store_id),'price',o.price,'stock',o.stock,'url',o.url)),'[]'),
      coalesce(array_agg(lower(o.store_id)),'{}') into offers,stores
    from (
      select distinct on(lower(pp.store_id)) pp.id,pp.store_id,pp.price,pp.stock,pp.url
      from public.product_prices pp where pp.product_id=product_key
        and pp.price>0 and pp.price::text not in ('NaN','Infinity','-Infinity')
      order by lower(pp.store_id),(pp.stock='out-of-stock'),
        (pp.identity_review is not null and (pp.identity_review->>'status' is distinct from 'consistent'
          or pp.identity_review#>>'{subject,url}' is distinct from pp.url)),pp.price,pp.last_updated desc,pp.url
    ) o;
    insert into public.catalog_price_summaries(product_id,lowest,highest,average,available,urls,offer_ids,store_ids,best_offers)
    select product_key,s.*,stores,offers from public.catalog_price_stats(offers) s
    on conflict(product_id) do update set lowest=excluded.lowest,highest=excluded.highest,
      average=excluded.average,available=excluded.available,urls=excluded.urls,
      offer_ids=excluded.offer_ids,store_ids=excluded.store_ids,best_offers=excluded.best_offers;
    if not found then delete from public.catalog_price_summaries where product_id=product_key; end if;
  end loop;
  return null;
end $$;

create or replace function public.sync_catalog_comparable_summary(p_product text)
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

create or replace function public.trigger_catalog_comparable_summary()
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

create trigger product_prices_catalog_summary after insert or update or delete on public.product_prices
for each row execute function public.sync_catalog_price_summary();
create trigger product_prices_usable_summary after insert or update or delete on public.product_prices
for each row execute function public.trigger_catalog_comparable_summary();

revoke all on function public.sync_catalog_price_summary() from public,anon,authenticated;
revoke all on function public.sync_catalog_comparable_summary(text),public.trigger_catalog_comparable_summary() from public,anon,authenticated;
grant execute on function public.sync_catalog_price_summary() to service_role;
grant execute on function public.sync_catalog_comparable_summary(text) to service_role;
COMMIT;
