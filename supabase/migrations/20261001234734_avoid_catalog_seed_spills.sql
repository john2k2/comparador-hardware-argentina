-- Hashes acotados evitan derrames temporales al recorrer el catálogo.
ALTER FUNCTION public.seed_catalog_refresh_queue() SET work_mem='32MB';
ANALYZE public.products;
ANALYZE public.product_prices;
ANALYZE public.catalog_offer_refresh_state;
