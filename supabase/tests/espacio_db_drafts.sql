-- Exclusivamente para una base PostgreSQL LOCAL desechable con bootstrap-local.sql y
-- todas las migraciones aplicadas. Ejecutar desde la raíz del repo:
--   psql -X -v ON_ERROR_STOP=1 -f supabase/tests/espacio_db_drafts.sql
-- Aplica los borradores de docs/reports/espacio-db-2026-10-08/sql, verifica su
-- comportamiento, compara resúmenes contra las definiciones originales y revierte.
-- Deja la base con las definiciones originales y sin fixtures.
\set ON_ERROR_STOP 1
\set QUIET 1
select set_config('espacio.base', to_char(date_trunc('second', now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), false) \gset

create temp table espacio_definitions_before as
select 'function:' || p.proname as item, md5(pg_get_functiondef(p.oid)) as signature
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('sync_catalog_price_summary','sync_catalog_comparable_summary','trigger_catalog_comparable_summary')
union all
select 'trigger:' || tgname, md5(pg_get_triggerdef(oid)) from pg_trigger
where not tgisinternal and tgrelid in ('public.products'::regclass, 'public.product_prices'::regclass);

create temp table espacio_summary_runs(run text, scenario text, summary jsonb);

-- Escenario idéntico para comparar borradores contra originales. Las fechas son relativas
-- a espacio.base, fijada una vez, para que ambas corridas sean comparables. Se toma una
-- foto normalizada después de cada paso: un paso posterior recalcula la ficha completa
-- y podría ocultar un disparo omitido por error.
create or replace function pg_temp.espacio_snapshot(p_run text, p_step text) returns void language plpgsql as $$
declare product_key text := 'espacio-scenario-' || p_run; normalized jsonb;
begin
  select jsonb_build_object(
    'lowest', s.lowest, 'highest', s.highest, 'average', s.average, 'available', s.available, 'store_ids', s.store_ids,
    'best_offers', (select jsonb_agg((o - 'id') || jsonb_build_object('url', replace(o->>'url', p_run, 'RUN')) order by o->>'store_id') from jsonb_array_elements(s.best_offers) o),
    'winner_urls', (select jsonb_agg(replace(pp.url, p_run, 'RUN') order by pp.url) from public.product_prices pp where pp.id = any(s.offer_ids)),
    'comparable_offers', (select jsonb_agg((o - 'id') || jsonb_build_object('url', replace(o->>'url', p_run, 'RUN')) order by o->>'url') from jsonb_array_elements(s.comparable_offers) o),
    'comparable_stats', s.comparable_stats - 'offer_ids' - 'urls',
    'comparable_valid_until', s.comparable_valid_until, 'comparable_latest_observed_at', s.comparable_latest_observed_at,
    'comparable_initialized', s.comparable_initialized)
  into normalized from public.catalog_price_summaries s where s.product_id = product_key;
  insert into espacio_summary_runs values (p_run, p_step, coalesce(normalized, '"sin-resumen"'::jsonb));
end $$;

create or replace function pg_temp.espacio_scenario(p_run text) returns void language plpgsql as $$
declare product_key text := 'espacio-scenario-' || p_run; base timestamptz := current_setting('espacio.base')::timestamptz;
begin
  insert into public.products(id, name, category, model) values (product_key, 'AMD Ryzen 5 5600 Espacio', 'procesadores', '5600');
  insert into public.product_prices(product_id, store_id, url, price, stock, last_updated, source_identity) values
    (product_key, 'mexx', 'https://www.mexx.com.ar/producto/espacio-' || p_run, 210000, 'in-stock', base - interval '2 hours',
      jsonb_build_object('title','AMD Ryzen 5 5600 Espacio','listingRef','mexx:' || p_run)),
    (product_key, 'venex', 'https://www.venex.com.ar/producto/espacio-' || p_run, 220000, 'in-stock', base - interval '3 hours', null),
    (product_key, 'venex', 'https://www.venex.com.ar/producto/espacio-b-' || p_run, 220000, 'in-stock', base - interval '4 hours', null);
  perform pg_temp.espacio_snapshot(p_run, '1-insert');
  update public.product_prices set state_signature = 'sig-1' where product_id = product_key;
  perform pg_temp.espacio_snapshot(p_run, '2-irrelevant');
  update public.product_prices set source_identity = source_identity, price_condition = price_condition where product_id = product_key;
  perform pg_temp.espacio_snapshot(p_run, '3-identical');
  update public.product_prices set last_updated = base - interval '30 minutes' where product_id = product_key and store_id = 'mexx';
  perform pg_temp.espacio_snapshot(p_run, '4-freshness');
  -- Desempate por last_updated entre dos URLs de la misma tienda con el mismo precio.
  update public.product_prices set last_updated = base - interval '10 minutes' where url = 'https://www.venex.com.ar/producto/espacio-b-' || p_run;
  perform pg_temp.espacio_snapshot(p_run, '5-tiebreak');
  update public.product_prices set source_identity = jsonb_build_object('title','AMD Ryzen 5 5600G','listingRef','mexx:' || p_run)
    where product_id = product_key and store_id = 'mexx';
  perform pg_temp.espacio_snapshot(p_run, '6-source-conflict');
  update public.product_prices set price = 199999.99 where product_id = product_key and store_id = 'mexx';
  perform pg_temp.espacio_snapshot(p_run, '7-price');
  update public.product_prices set stock = 'out-of-stock' where url = 'https://www.venex.com.ar/producto/espacio-' || p_run;
  perform pg_temp.espacio_snapshot(p_run, '8-stock');
  update public.product_prices set identity_review = jsonb_build_object('status','needs-review','subject',jsonb_build_object('url','x'))
    where url = 'https://www.venex.com.ar/producto/espacio-b-' || p_run;
  perform pg_temp.espacio_snapshot(p_run, '9-identity-review');
  update public.product_prices set price = 0 where product_id = product_key;
  perform pg_temp.espacio_snapshot(p_run, '10-no-prices');
  delete from public.product_prices where product_id = product_key;
  delete from public.products where id = product_key;
end $$;

select pg_temp.espacio_scenario('original');

\i docs/reports/espacio-db-2026-10-08/sql/01-sweep-expired-shared-cache.sql
\i docs/reports/espacio-db-2026-10-08/sql/02-summary-trigger-guards.sql
\i docs/reports/espacio-db-2026-10-08/sql/03-products-last-scraped-throttle.sql

select pg_temp.espacio_scenario('draft');
do $$
begin
  assert (select count(*) from espacio_summary_runs where run = 'original') = 10;
  assert not exists (
    select 1 from espacio_summary_runs o full join espacio_summary_runs d on d.scenario = o.scenario and d.run = 'draft'
    where o.run = 'original' and d.summary is distinct from o.summary),
    'Los borradores producen el mismo resumen histórico y comparable que las originales después de cada paso';
  assert (select summary from espacio_summary_runs where run = 'draft' and scenario = '10-no-prices') = '"sin-resumen"';
end $$;

-- 01: barrido de caché vencida no telemétrica.
begin;
-- Supabase concede estos privilegios por defecto a service_role; el bootstrap local no.
-- FOR UPDATE exige UPDATE además de SELECT/DELETE.
grant select, update, delete on public.api_cache_entries to service_role;
insert into public.api_cache_entries(cache_key, scope, payload, expires_at, created_at, updated_at) values
  ('search-response-v2:a', 'search-response-v2', '{}', now() - interval '3 hours', now() - interval '4 hours', now() - interval '4 hours'),
  ('search-response-v2:b', 'search-response-v2', '{}', now() - interval '2 hours', now() - interval '4 hours', now() - interval '4 hours'),
  ('search-response-v2:c', 'search-response-v2', '{}', now() - interval '1 hours', now() - interval '4 hours', now() - interval '4 hours'),
  ('product-detail-v3:a', 'product-detail-v3', '{}', now() - interval '1 hours', now() - interval '4 hours', now() - interval '4 hours'),
  ('search-response-v2:active', 'search-response-v2', '{}', now() + interval '3 minutes', now(), now()),
  ('search-response-v2:recent-write', 'search-response-v2', '{}', now() - interval '20 minutes', now() - interval '1 minute', now() - interval '1 minute'),
  ('operational-store-event:old', 'operational-store-event', '{}', now() - interval '9 days', now() - interval '11 days', now() - interval '11 days'),
  ('operational-endpoint-event:old', 'operational-endpoint-event', '{}', now() - interval '9 days', now() - interval '11 days', now() - interval '11 days'),
  ('catalog-refresh-demand:all:x', 'catalog-refresh-demand', '{"requestCount":7}', now() - interval '1 day', now() - interval '15 days', now() - interval '15 days'),
  ('eneba-affiliate-pilot:snapshot', 'eneba-affiliate-pilot', '{}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
  ('mystery:old', 'mystery', '{}', now() - interval '9 days', now() - interval '11 days', now() - interval '11 days');
do $$
declare result jsonb; cutoff timestamptz := now() - interval '10 minutes';
begin
  assert not has_function_privilege('anon', 'public.sweep_expired_shared_cache(timestamptz,integer)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.sweep_expired_shared_cache(timestamptz,integer)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.sweep_expired_shared_cache(timestamptz,integer)', 'EXECUTE');
  begin perform public.sweep_expired_shared_cache(now(), 10); assert false, 'Corte reciente rechazado';
  exception when sqlstate '22023' then null; end;
  begin perform public.sweep_expired_shared_cache(cutoff, 0); assert false, 'Límite cero rechazado';
  exception when sqlstate '22023' then null; end;
  begin perform public.sweep_expired_shared_cache(cutoff, 2001); assert false, 'Límite excesivo rechazado';
  exception when sqlstate '22023' then null; end;
  set local role service_role;
  result := public.sweep_expired_shared_cache(cutoff, 2);
  assert (result->>'removed')::int = 2 and (result->>'may_have_more')::boolean, result::text;
  assert not exists (select 1 from public.api_cache_entries where cache_key in ('search-response-v2:a','search-response-v2:b')), 'Barre primero lo más antiguo';
  result := public.sweep_expired_shared_cache(cutoff, 100);
  assert (result->>'removed')::int = 2 and not (result->>'may_have_more')::boolean, result::text;
  assert result->'by_scope' = '{"search-response-v2":1,"product-detail-v3":1}'::jsonb, result::text;
  result := public.sweep_expired_shared_cache(cutoff, 100);
  assert (result->>'removed')::int = 0, result::text;
  reset role;
  assert (select array_agg(cache_key order by cache_key) from public.api_cache_entries where cache_key not like 'espacio%') @> array[
    'catalog-refresh-demand:all:x','eneba-affiliate-pilot:snapshot','mystery:old','operational-endpoint-event:old',
    'operational-store-event:old','search-response-v2:active','search-response-v2:recent-write'], 'Conserva telemetría, demanda, Eneba, desconocidos, activos y escritos después del corte';
end $$;
rollback;

-- 02: triggers con WHEN y escritura idéntica omitida.
begin;
insert into public.products(id, name, category, model) values ('espacio-guard', 'AMD Ryzen 5 5600 Guard', 'procesadores', '5600');
insert into public.product_prices(id, product_id, store_id, url, price, stock, last_updated, source_identity) values
  ('00000000-0000-0000-0000-00000000e501', 'espacio-guard', 'mexx', 'https://www.mexx.com.ar/producto/espacio-guard', 210000, 'in-stock', now() - interval '2 hours',
    '{"title":"AMD Ryzen 5 5600 Guard","listingRef":"mexx:guard"}'),
  ('00000000-0000-0000-0000-00000000e502', 'espacio-guard', 'venex', 'https://www.venex.com.ar/producto/espacio-guard', 220000, 'in-stock', now() - interval '3 hours', null);
do $$
declare before_ctid tid; before_row public.catalog_price_summaries; after_row public.catalog_price_summaries;
begin
  select ctid into before_ctid from public.catalog_price_summaries where product_id = 'espacio-guard';
  select * into before_row from public.catalog_price_summaries where product_id = 'espacio-guard';
  assert before_row.lowest = 210000 and before_row.comparable_initialized, 'INSERT crea ambos resúmenes';

  update public.product_prices set state_signature = 'irrelevante', installment_count = 6, price_condition = 'unspecified' where product_id = 'espacio-guard';
  assert (select ctid from public.catalog_price_summaries where product_id = 'espacio-guard') = before_ctid, 'Columnas no leídas no reescriben el resumen';
  update public.product_prices set source_identity = source_identity, identity_review = identity_review where product_id = 'espacio-guard';
  assert (select ctid from public.catalog_price_summaries where product_id = 'espacio-guard') = before_ctid, 'El segundo UPDATE idéntico de los wrappers no reescribe';

  -- Frescura: sólo last_updated cambia y el resumen comparable debe reflejarlo.
  update public.product_prices set last_updated = now() - interval '1 minute' where id = '00000000-0000-0000-0000-00000000e501';
  select * into after_row from public.catalog_price_summaries where product_id = 'espacio-guard';
  assert after_row.comparable_latest_observed_at = now() - interval '1 minute', 'La observación renovada llega a comparable_latest_observed_at';
  assert (select (o->>'last_updated')::timestamptz from jsonb_array_elements(after_row.comparable_offers) o where o->>'id' = '00000000-0000-0000-0000-00000000e501')
    = now() - interval '1 minute', 'comparable_offers conserva la fecha observada de la oferta';
  assert (after_row.comparable_stats->>'observed_at')::timestamptz = now() - interval '1 minute';
  assert (after_row.lowest, after_row.best_offers) = (before_row.lowest, before_row.best_offers), 'El histórico no cambia de contenido';

  update public.product_prices set price = 205000 where id = '00000000-0000-0000-0000-00000000e501';
  select * into after_row from public.catalog_price_summaries where product_id = 'espacio-guard';
  assert after_row.lowest = 205000 and (after_row.comparable_stats->>'lowest')::numeric = 205000, 'Cambio de precio actualiza ambos';

  update public.product_prices set stock = 'out-of-stock' where id = '00000000-0000-0000-0000-00000000e501';
  select * into after_row from public.catalog_price_summaries where product_id = 'espacio-guard';
  assert after_row.lowest = 220000 and after_row.available = 1 and (after_row.comparable_stats->>'lowest')::numeric = 220000, 'Cambio de stock actualiza ambos';

  update public.product_prices set url = 'https://www.venex.com.ar/producto/espacio-guard-2' where id = '00000000-0000-0000-0000-00000000e502';
  assert (select urls from public.catalog_price_summaries where product_id = 'espacio-guard') like '%espacio-guard-2%', 'Cambio de URL actualiza el histórico';

  update public.product_prices set source_identity = '{"title":"AMD Ryzen 5 5600G","listingRef":"mexx:guard"}', stock = 'in-stock'
    where id = '00000000-0000-0000-0000-00000000e501';
  assert not exists (select 1 from public.catalog_price_summaries s, jsonb_array_elements(s.comparable_offers) o
    where s.product_id = 'espacio-guard' and o->>'id' = '00000000-0000-0000-0000-00000000e501'), 'Identidad de origen en conflicto sale del comparable';

  delete from public.product_prices where id = '00000000-0000-0000-0000-00000000e502';
  assert (select store_ids from public.catalog_price_summaries where product_id = 'espacio-guard') = array['mexx'], 'DELETE sigue actualizando';
  delete from public.product_prices where product_id = 'espacio-guard';
  assert not exists (select 1 from public.catalog_price_summaries where product_id = 'espacio-guard'), 'Sin ofertas se borra el resumen';
end $$;
rollback;

-- 03: avance de last_scraped_at limitado a 15 minutos, frescura de la oferta intacta.
begin;
insert into public.products(id, name, category, model, last_scraped_at) values
  ('espacio-throttle', 'AMD Ryzen 5 5600 Throttle', 'procesadores', '5600', now() - interval '5 minutes');
insert into public.product_prices(product_id, store_id, url, price, stock, last_updated) values
  ('espacio-throttle', 'mexx', 'https://www.mexx.com.ar/producto/espacio-throttle', 210000, 'in-stock', now() - interval '5 minutes');
do $$
declare before_ctid tid; before_updated timestamptz; observed boolean;
begin
  select ctid, updated_at into before_ctid, before_updated from public.products where id = 'espacio-throttle';
  update public.products set last_scraped_at = now() - interval '1 minute' where id = 'espacio-throttle';
  assert (select (ctid, last_scraped_at, updated_at) from public.products where id = 'espacio-throttle')
    = (before_ctid, now() - interval '5 minutes', before_updated), 'Avance < 15 min sin otro cambio no escribe la fila';

  observed := public.persist_priority_offer('espacio-throttle', 'mexx', 'https://www.mexx.com.ar/producto/espacio-throttle',
    210000, null, 'in-stock', null, null, now(), now(), null, 'sig-throttle');
  assert observed, 'La observación prioritaria se guarda';
  assert (select last_updated from public.product_prices where product_id = 'espacio-throttle') = now(), 'La oferta conserva su fecha observada';
  assert (select comparable_latest_observed_at from public.catalog_price_summaries where product_id = 'espacio-throttle') = now(), 'El resumen comparable recibe la observación';
  assert (select last_scraped_at from public.products where id = 'espacio-throttle') = now() - interval '5 minutes', 'La ficha se atrasa < 15 min, nunca se adelanta';

  update public.products set last_scraped_at = now() - interval '1 minute', name = 'AMD Ryzen 5 5600 Throttle X' where id = 'espacio-throttle';
  assert (select (last_scraped_at, name) from public.products where id = 'espacio-throttle')
    = (now() - interval '1 minute', 'AMD Ryzen 5 5600 Throttle X'::text), 'Con otra columna cambiada se escribe todo';

  update public.products set last_scraped_at = now() - interval '30 minutes' where id = 'espacio-throttle';
  update public.products set last_scraped_at = now() where id = 'espacio-throttle';
  assert (select last_scraped_at from public.products where id = 'espacio-throttle') = now(), 'Avance >= 15 min se escribe';

end $$;
rollback;

\i docs/reports/espacio-db-2026-10-08/sql/03-products-last-scraped-throttle.rollback.sql
\i docs/reports/espacio-db-2026-10-08/sql/02-summary-trigger-guards.rollback.sql
\i docs/reports/espacio-db-2026-10-08/sql/01-sweep-expired-shared-cache.rollback.sql

do $$
begin
  assert not exists (
    (select item, signature from espacio_definitions_before)
    except
    (select 'function:' || p.proname, md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('sync_catalog_price_summary','sync_catalog_comparable_summary','trigger_catalog_comparable_summary')
     union all
     select 'trigger:' || tgname, md5(pg_get_triggerdef(oid)) from pg_trigger
      where not tgisinternal and tgrelid in ('public.products'::regclass, 'public.product_prices'::regclass))
  ), 'Las reversiones restauran funciones y triggers originales';
  assert (select count(*) from pg_trigger where not tgisinternal and tgrelid in ('public.products'::regclass, 'public.product_prices'::regclass))
    = (select count(*) from espacio_definitions_before where item like 'trigger:%'), 'No quedan triggers extra';
  assert to_regprocedure('public.sweep_expired_shared_cache(timestamptz,integer)') is null;
  assert to_regprocedure('public.throttle_products_last_scraped_at()') is null;
end $$;
select 'espacio_db_drafts: OK' as result;
