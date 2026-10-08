-- BORRADOR, NO APLICADO. Fuera de supabase/migrations a propósito.
-- Reduce reescrituras de catalog_price_summaries por observación sin cambiar contenido:
--  1. Los triggers de UPDATE sólo se disparan si cambia una columna que su resumen lee.
--     INSERT/DELETE conservan el disparo incondicional (WHEN no admite OLD en INSERT
--     ni NEW en DELETE, por eso se separan en dos triggers con el mismo orden alfabético).
--  2. El resumen histórico no escribe una versión nueva si el resultado es idéntico.
--  3. El resumen comparable no escribe si sus cinco columnas no cambian.
--  4. El trigger comparable toma el bloqueo de la ficha por sí mismo: antes lo heredaba
--     del trigger histórico, que ahora puede omitirse.
-- Frescura: comparable_offers lleva last_updated de cada oferta y la ventana de 24 h se
-- evalúa al leer, así que last_updated está en ambos WHEN. Una observación que sólo
-- renueva last_updated sigue reescribiendo el resumen comparable (contrato vigente).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.sync_catalog_price_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE product_key text; offers jsonb; stores text[]; stats record;
BEGIN
  FOR product_key IN SELECT DISTINCT key FROM unnest(ARRAY[
    CASE WHEN tg_op <> 'INSERT' THEN old.product_id END,
    CASE WHEN tg_op <> 'DELETE' THEN new.product_id END
  ]) key WHERE key IS NOT NULL ORDER BY key LOOP
    PERFORM 1 FROM public.products WHERE id = product_key FOR UPDATE;
    IF NOT found THEN CONTINUE; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',lower(o.store_id),'price',o.price,'stock',o.stock,'url',o.url)),'[]'),
      coalesce(array_agg(lower(o.store_id)),'{}') INTO offers, stores
    FROM (
      SELECT DISTINCT ON (lower(pp.store_id)) pp.id, pp.store_id, pp.price, pp.stock, pp.url
      FROM public.product_prices pp WHERE pp.product_id = product_key
        AND pp.price > 0 AND pp.price::text NOT IN ('NaN','Infinity','-Infinity')
      ORDER BY lower(pp.store_id), (pp.stock = 'out-of-stock'),
        (pp.identity_review IS NOT NULL AND (pp.identity_review->>'status' IS DISTINCT FROM 'consistent'
          OR pp.identity_review#>>'{subject,url}' IS DISTINCT FROM pp.url)), pp.price, pp.last_updated DESC, pp.url
    ) o;
    SELECT * INTO stats FROM public.catalog_price_stats(offers);
    -- La versión anterior usaba FOUND del upsert para decidir el DELETE; con el WHERE
    -- del DO UPDATE una fila idéntica deja FOUND en falso, así que se decide antes.
    IF NOT found THEN
      DELETE FROM public.catalog_price_summaries WHERE product_id = product_key;
      CONTINUE;
    END IF;
    INSERT INTO public.catalog_price_summaries AS s (product_id,lowest,highest,average,available,urls,offer_ids,store_ids,best_offers)
    VALUES (product_key, stats.lowest, stats.highest, stats.average, stats.available, stats.urls, stats.offer_ids, stores, offers)
    ON CONFLICT (product_id) DO UPDATE SET lowest = excluded.lowest, highest = excluded.highest,
      average = excluded.average, available = excluded.available, urls = excluded.urls,
      offer_ids = excluded.offer_ids, store_ids = excluded.store_ids, best_offers = excluded.best_offers
    WHERE (s.lowest, s.highest, s.average, s.available, s.urls, s.offer_ids, s.store_ids, s.best_offers)
      IS DISTINCT FROM (excluded.lowest, excluded.highest, excluded.average, excluded.available,
        excluded.urls, excluded.offer_ids, excluded.store_ids, excluded.best_offers);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.sync_catalog_comparable_summary(p_product text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE offers jsonb; stats record; latest_at timestamptz; expires_at timestamptz; observed_at timestamptz; next_stats jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',lower(o.store_id),'price',o.price,'stock',o.stock,'url',o.url,'last_updated',o.last_updated) ORDER BY o.store_id,o.price,o.id),'[]')
  INTO offers FROM public.product_prices o JOIN public.products p ON p.id = o.product_id
  WHERE o.product_id = p_product AND public.catalog_offer_is_comparable(o.price,o.stock,o.url,o.identity_review,p.name,p.category,o.source_identity,o.store_id);
  SELECT * INTO stats FROM public.catalog_current_price_stats(offers);
  SELECT max(last_updated), CASE WHEN bool_or(last_updated > now() + interval '1 minute') THEN now()
    ELSE min(last_updated + interval '24 hours') FILTER (WHERE last_updated >= now() - interval '24 hours') END,
    max(last_updated) FILTER (WHERE id = ANY (stats.offer_ids))
  INTO latest_at, expires_at, observed_at
  FROM jsonb_to_recordset(offers) o(id uuid, last_updated timestamptz);
  next_stats := CASE WHEN stats.lowest IS NOT NULL THEN to_jsonb(stats) || jsonb_build_object('observed_at', observed_at) END;
  UPDATE public.catalog_price_summaries SET comparable_initialized = true, comparable_offers = offers,
    comparable_stats = next_stats, comparable_valid_until = expires_at, comparable_latest_observed_at = latest_at
  WHERE product_id = p_product
    AND (comparable_initialized, comparable_offers, comparable_stats, comparable_valid_until, comparable_latest_observed_at)
      IS DISTINCT FROM (true, offers, next_stats, expires_at, latest_at);
END $$;

CREATE OR REPLACE FUNCTION public.trigger_catalog_comparable_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE product_key text;
BEGIN
  IF tg_table_name = 'product_prices' THEN
    FOR product_key IN SELECT DISTINCT key FROM unnest(ARRAY[CASE WHEN tg_op <> 'INSERT' THEN old.product_id END, CASE WHEN tg_op <> 'DELETE' THEN new.product_id END]) key WHERE key IS NOT NULL ORDER BY key LOOP
      -- Mismo bloqueo que el resumen histórico; reentrante si el escritor ya lo tomó.
      PERFORM 1 FROM public.products WHERE id = product_key FOR UPDATE;
      IF NOT found THEN CONTINUE; END IF;
      PERFORM public.sync_catalog_comparable_summary(product_key);
    END LOOP;
  ELSIF tg_table_name = 'products' THEN PERFORM public.sync_catalog_comparable_summary(new.id);
  ELSIF old.url IS DISTINCT FROM new.url THEN
    FOR product_key IN SELECT DISTINCT product_id FROM public.product_prices WHERE store_id = new.id ORDER BY product_id LOOP
      PERFORM public.sync_catalog_comparable_summary(product_key);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER product_prices_catalog_summary ON public.product_prices;
DROP TRIGGER product_prices_usable_summary ON public.product_prices;

-- Orden alfabético resultante para un UPDATE: catalog_summary_update -> usable_summary_update,
-- igual que antes (histórico antes que comparable).
CREATE TRIGGER product_prices_catalog_summary AFTER INSERT OR DELETE ON public.product_prices
FOR EACH ROW EXECUTE FUNCTION public.sync_catalog_price_summary();
CREATE TRIGGER product_prices_catalog_summary_update AFTER UPDATE ON public.product_prices
FOR EACH ROW WHEN (
  (old.product_id, old.store_id, old.price, old.stock, old.url, old.identity_review, old.last_updated)
  IS DISTINCT FROM (new.product_id, new.store_id, new.price, new.stock, new.url, new.identity_review, new.last_updated)
) EXECUTE FUNCTION public.sync_catalog_price_summary();

CREATE TRIGGER product_prices_usable_summary AFTER INSERT OR DELETE ON public.product_prices
FOR EACH ROW EXECUTE FUNCTION public.trigger_catalog_comparable_summary();
CREATE TRIGGER product_prices_usable_summary_update AFTER UPDATE ON public.product_prices
FOR EACH ROW WHEN (
  (old.product_id, old.store_id, old.price, old.stock, old.url, old.identity_review, old.source_identity, old.last_updated)
  IS DISTINCT FROM (new.product_id, new.store_id, new.price, new.stock, new.url, new.identity_review, new.source_identity, new.last_updated)
) EXECUTE FUNCTION public.trigger_catalog_comparable_summary();

REVOKE ALL ON FUNCTION public.sync_catalog_price_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_catalog_comparable_summary(text), public.trigger_catalog_comparable_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_catalog_price_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_catalog_comparable_summary(text) TO service_role;
COMMIT;
