-- Lecturas previas, SÓLO LECTURA. Cada bloque termina en ROLLBACK y tiene timeout corto.
-- Las ejecuta Jonathan/coordinador con autorización de lectura; este paquete no las corrió
-- contra Supabase. Guardar la salida con fecha/hora UTC: los contadores de pg_stat no tienen
-- período garantizado (stats_reset fue NULL en la lectura del 07/10).

-- A. Tamaños actuales y base.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT clock_timestamp() AS captured_at, pg_database_size(current_database()) AS database_bytes,
  (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS stats_reset;
SELECT c.relname, pg_total_relation_size(c.oid) AS total_bytes, pg_relation_size(c.oid) AS heap_bytes,
  pg_indexes_size(c.oid) AS index_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('api_cache_entries','products','product_prices','price_history','catalog_price_summaries')
ORDER BY 2 DESC;
ROLLBACK;

-- B. Caché por scope: vencidas, activas y bytes de payload de las vencidas (operaciones 01 y 05).
-- Recorre la tabla completa; si cancela por timeout, NO ampliar: repetir sólo los conteos.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT scope, count(*) AS rows, count(*) FILTER (WHERE expires_at < now() - interval '5 minutes') AS expired,
  sum(pg_column_size(payload)) FILTER (WHERE expires_at < now() - interval '5 minutes') AS expired_payload_bytes,
  max(updated_at) AS last_write
FROM public.api_cache_entries GROUP BY scope ORDER BY rows DESC;
ROLLBACK;

-- C. Índices candidatos: definición exacta, tamaño, uso registrado y validez (operación 04).
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT s.relname AS table_name, s.indexrelname AS index_name, pg_get_indexdef(s.indexrelid) AS definition,
  pg_relation_size(s.indexrelid) AS bytes, s.idx_scan, s.last_idx_scan, s.idx_tup_read,
  i.indisvalid, i.indisunique, i.indisprimary,
  (SELECT count(*) FROM pg_constraint k WHERE k.conindid = s.indexrelid) AS constraints
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public' AND s.indexrelname IN (
  'products_updated_at_idx','products_updated_at_desc_idx',
  'price_history_product_store_idx','price_history_product_recorded_idx','price_history_store_recorded_idx',
  'price_history_offer_idx','price_history_recorded_at_idx',
  'product_prices_product_id_idx','product_prices_product_id_store_id_url_key',
  'product_prices_last_updated_idx','product_prices_sitemap_eligible_idx',
  'catalog_price_summaries_lowest_idx','products_family_key_idx')
ORDER BY s.relname, bytes DESC;
ROLLBACK;

-- D. Amplificación de escritura (operaciones 02 y 03): updates totales vs HOT.
-- Repetir 24 h después de aplicar para comparar deltas, no valores absolutos.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT relname, n_tup_ins, n_tup_upd, n_tup_hot_upd, n_tup_newpage_upd, n_tup_del, n_live_tup, n_dead_tup,
  last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables WHERE schemaname = 'public'
  AND relname IN ('products','product_prices','catalog_price_summaries','api_cache_entries','price_history');
ROLLBACK;

-- E. Producción coincide con las migraciones que los borradores reemplazan.
-- Esperado: product_prices_catalog_summary y product_prices_usable_summary
-- "AFTER INSERT OR DELETE OR UPDATE" sin WHEN; products_set_updated_at sin WHEN;
-- no existen products_last_scraped_throttle ni sweep_expired_shared_cache.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT tgrelid::regclass AS table_name, tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE NOT tgisinternal
  AND tgrelid IN ('public.products'::regclass, 'public.product_prices'::regclass)
ORDER BY 1, 2;
SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('sync_catalog_price_summary','sync_catalog_comparable_summary',
  'trigger_catalog_comparable_summary','sweep_expired_shared_cache','throttle_products_last_scraped_at')
ORDER BY 1;
-- La función 01 es SECURITY INVOKER: service_role necesita SELECT, UPDATE (FOR UPDATE) y DELETE.
SELECT has_table_privilege('service_role', 'public.api_cache_entries', 'SELECT') AS can_select,
  has_table_privilege('service_role', 'public.api_cache_entries', 'UPDATE') AS can_lock,
  has_table_privilege('service_role', 'public.api_cache_entries', 'DELETE') AS can_delete,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') AS bypass_rls;
ROLLBACK;

-- F. Escrituras de products que sólo avanzan last_scraped_at (operación 03): no hay
-- contador directo; usar pg_stat_statements si está habilitado (sólo agregados).
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT calls, rows, round(total_exec_time) AS total_ms, left(query, 120) AS query_head
FROM pg_stat_statements
WHERE query ILIKE 'update public.products set last_scraped_at%' ORDER BY calls DESC LIMIT 10;
ROLLBACK;
