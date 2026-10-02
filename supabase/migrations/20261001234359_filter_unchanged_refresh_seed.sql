-- Una cola sin cambios no debe bloquear todas las ofertas en cada ejecución.
CREATE OR REPLACE FUNCTION public.seed_catalog_refresh_queue() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET jit=off AS $$
DECLARE changed integer;
BEGIN
 INSERT INTO public.catalog_offer_refresh_state(offer_id,category)
 SELECT pp.id,p.category FROM public.product_prices pp
 JOIN public.products p ON p.id=pp.product_id
 LEFT JOIN public.catalog_offer_refresh_state q ON q.offer_id=pp.id
 WHERE q.offer_id IS NULL OR q.category IS DISTINCT FROM p.category
 ON CONFLICT(offer_id) DO UPDATE SET category=excluded.category
 WHERE catalog_offer_refresh_state.category IS DISTINCT FROM excluded.category;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
