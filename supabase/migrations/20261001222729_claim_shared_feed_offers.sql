-- El feed de CompraGamer se lee una vez; revisar sus filas no agrega pedidos a la tienda.
-- Reservar trabajo separado evita que detalles lentos consuman toda la ejecución.
CREATE FUNCTION public.claim_catalog_feed_refresh(p_token uuid,p_limit integer DEFAULT 24)
RETURNS TABLE(offer_id uuid,product_id text,store_id text,url text,interval_hours integer,reason text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET jit=off SET work_mem='32MB' AS $$
BEGIN
 IF p_token IS NULL OR p_limit NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'REFRESH_INVALID_CLAIM'; END IF;
 RETURN QUERY
 WITH due AS MATERIALIZED (
  SELECT v.offer_id,v.interval_hours,v.reason,v.last_attempt_at,v.last_updated
  FROM public.catalog_refresh_policy v
  WHERE v.store_id='compragamer'
   AND coalesce(v.next_attempt_at,'-infinity'::timestamptz)<=now()
   AND coalesce(v.leased_until,'-infinity'::timestamptz)<=now()
   AND (v.last_updated IS NULL OR v.last_updated<=now()-make_interval(hours=>v.interval_hours))
 ), maintenance AS (
  SELECT d.offer_id FROM due d WHERE d.interval_hours>24
  ORDER BY d.last_attempt_at NULLS FIRST,d.last_updated NULLS FIRST,d.offer_id LIMIT greatest(1,p_limit/4)
 ), candidates AS (
  SELECT d.* FROM due d
  ORDER BY (d.offer_id IN (SELECT m.offer_id FROM maintenance m)) DESC,(d.interval_hours<=24) DESC,
   d.last_attempt_at NULLS FIRST,d.last_updated NULLS FIRST,d.offer_id LIMIT p_limit
 ), locked AS (
  SELECT q.offer_id FROM public.catalog_offer_refresh_state q JOIN candidates c ON c.offer_id=q.offer_id
  WHERE coalesce(q.leased_until,'-infinity'::timestamptz)<=now()
  ORDER BY q.offer_id FOR UPDATE OF q SKIP LOCKED
 ), claimed AS (
  UPDATE public.catalog_offer_refresh_state q SET lease_token=p_token,leased_until=now()+interval '20 minutes'
  FROM locked l WHERE q.offer_id=l.offer_id RETURNING q.offer_id
 )
 SELECT c.offer_id,pp.product_id,pp.store_id,pp.url,c.interval_hours,c.reason
 FROM candidates c JOIN claimed cl ON cl.offer_id=c.offer_id JOIN public.product_prices pp ON pp.id=c.offer_id
 ORDER BY c.offer_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_catalog_feed_refresh(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_catalog_feed_refresh(uuid,integer) TO service_role;
