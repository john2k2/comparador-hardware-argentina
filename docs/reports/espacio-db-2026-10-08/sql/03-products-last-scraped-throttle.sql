-- BORRADOR, NO APLICADO. Fuera de supabase/migrations a propósito.
-- Omite el UPDATE de products cuando lo único que cambia es last_scraped_at y el
-- avance es menor a 15 minutos. last_scraped_at está en tres índices
-- (catalog_lookup INCLUDE, catalog_identity_preference, refresh_priority_last_scraped):
-- cada avance impide HOT y agrega entradas en los 20 índices de products, 7 GIN trigram.
--
-- Contrato preservado:
--  * La frescura de cada oferta (product_prices.last_updated, comparable_offers) no se toca.
--  * last_scraped_at nunca queda adelantado: puede atrasarse < 15 min respecto de la
--    última observación. Lectores: puntaje de búsqueda (cubetas >= 4 h), desempate de
--    identidad, planificación de refresh (lo ve antes como vencido) y poda de ofertas
--    fantasma (lo ve menos fresco: borra menos). Todos toleran un atraso así.
--  * Cualquier otra columna base distinta (incluidas futuras) impide la omisión:
--    la comparación usa la fila completa menos last_scraped_at y las columnas GENERATED,
--    que en un BEFORE trigger todavía no están recalculadas.
--  * Ningún escritor SQL vigente consulta FOUND después de ese UPDATE.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.throttle_products_last_scraped_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF old.last_scraped_at IS NOT NULL AND new.last_scraped_at IS NOT NULL
    AND new.last_scraped_at >= old.last_scraped_at
    AND new.last_scraped_at < old.last_scraped_at + interval '15 minutes'
    AND (to_jsonb(new) - ARRAY['last_scraped_at','catalog_name','catalog_document','catalog_identity','catalog_component'])
      = (to_jsonb(old) - ARRAY['last_scraped_at','catalog_name','catalog_document','catalog_identity','catalog_component']) THEN
    RETURN NULL;
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.throttle_products_last_scraped_at() FROM PUBLIC, anon, authenticated;

-- Alfabéticamente anterior a products_set_updated_at: decide antes de tocar updated_at.
CREATE TRIGGER products_last_scraped_throttle BEFORE UPDATE ON public.products
FOR EACH ROW WHEN (old.last_scraped_at IS DISTINCT FROM new.last_scraped_at)
EXECUTE FUNCTION public.throttle_products_last_scraped_at();
COMMIT;
