-- Reversión del borrador 04: definiciones exactas de las migraciones de origen.
-- CREATE INDEX CONCURRENTLY no admite transacción; una sentencia por vez. Necesita
-- espacio libre del tamaño del índice y no bloquea escrituras; si falla, borrar el
-- índice INVALID resultante con DROP INDEX CONCURRENTLY y repetir.
SET statement_timeout = '600s';

-- 20260304235643_initial_argen_prices_schema.sql:81
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_updated_at_idx ON public.products (updated_at DESC);
-- 20260501172403_add_home_page_performance_indexes.sql:21
CREATE INDEX CONCURRENTLY IF NOT EXISTS price_history_product_store_idx ON public.price_history (product_id, store_id, recorded_at DESC);
-- 20260304235643_initial_argen_prices_schema.sql:85-86
CREATE INDEX CONCURRENTLY IF NOT EXISTS price_history_product_recorded_idx ON public.price_history (product_id, recorded_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS price_history_store_recorded_idx ON public.price_history (store_id, recorded_at DESC);
-- 20260930133000_catalog_price_read_model.sql:45
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_price_summaries_lowest_idx ON public.catalog_price_summaries (lowest, product_id);
-- 20260912170000_indexable_sitemap_rpc.sql:5 (verificar texto exacto antes de usar)
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_prices_sitemap_eligible_idx ON public.product_prices (product_id, store_id)
  WHERE price > 0 AND url IS NOT NULL AND stock <> 'out-of-stock';
-- 20260305210426_catalog_preprocessing_fields.sql:18
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_family_key_idx ON public.products (family_key);

RESET statement_timeout;
