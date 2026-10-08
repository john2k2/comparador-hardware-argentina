-- BORRADOR, NO APLICADO. Fuera de supabase/migrations a propósito.
-- DROP INDEX CONCURRENTLY no admite transacción: ejecutar UNA sentencia por vez, en
-- autocommit, con lock_timeout de sesión. Si una falla, queda un índice INVALID que se
-- repite con el mismo DROP; no reintentar en bucle.
-- Antes de cada sentencia: lectura C de 00-preflight-readonly.sql y criterios del README.
SET lock_timeout = '3s';
SET statement_timeout = '120s';

-- Ola 1 — duplicado exacto. Conservar products_updated_at_desc_idx (misma definición
-- btree(updated_at DESC), más usado en la lectura del 07/10). 1.400.832 B.
DROP INDEX CONCURRENTLY IF EXISTS public.products_updated_at_idx;

-- Ola 1b — sólo si el criterio de uso nulo se cumple (README, operación 4).
-- (product_id, store_id, recorded_at DESC). hardware_price_index usa price_history_offer_idx
-- (product_id, store_id, offer_url, recorded_at DESC) y "Bajaron de precio" usa
-- price_history_recorded_at_idx; ninguno de los dos se toca. 33.030.144 B.
-- DROP INDEX CONCURRENTLY IF EXISTS public.price_history_product_store_idx;

-- Ola 2 — candidatos condicionados a delta de idx_scan = 0 en una ventana >= 7 días
-- y a no encontrar lector en código/RPC. Quedan comentados a propósito.
-- DROP INDEX CONCURRENTLY IF EXISTS public.price_history_product_recorded_idx;   -- 30.097.408 B
-- DROP INDEX CONCURRENTLY IF EXISTS public.price_history_store_recorded_idx;     --  9.633.792 B
-- DROP INDEX CONCURRENTLY IF EXISTS public.catalog_price_summaries_lowest_idx;   --  9.256.960 B
-- DROP INDEX CONCURRENTLY IF EXISTS public.product_prices_sitemap_eligible_idx;  --  6.201.344 B
-- DROP INDEX CONCURRENTLY IF EXISTS public.products_family_key_idx;              --  1.990.656 B

-- NO recomendado: product_prices_product_id_idx (6.971.392 B, 140.310.475 scans al 07/10).
-- Es prefijo del unique (product_id, store_id, url), pero ese índice es ~3,4 veces mayor
-- y sirve la lectura más frecuente del sitio. Sólo con EXPLAIN comparado en laboratorio.

RESET lock_timeout;
RESET statement_timeout;
