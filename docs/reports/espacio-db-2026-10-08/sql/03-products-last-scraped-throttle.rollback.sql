-- Reversión del borrador 03. last_scraped_at vuelve a avanzar en cada observación
-- desde la siguiente escritura; no hace falta backfill (el atraso máximo era < 15 min).
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS products_last_scraped_throttle ON public.products;
DROP FUNCTION IF EXISTS public.throttle_products_last_scraped_at();
COMMIT;
