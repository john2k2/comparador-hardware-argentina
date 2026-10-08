-- Barrido acotado de caché compartida vencida que NO es telemetría.
-- Sólo scopes cuyo único lector es getSharedCache (trata vencido como ausente).
-- Excluidos explícitamente:
--   operational-store-event / operational-endpoint-event: retención respaldada existente
--     (select_backed_telemetry_candidates / retire_backed_telemetry).
--   catalog-refresh-demand: recordCatalogRefreshDemand lee el contador sin mirar
--     expires_at; borrarlo reinicia la acumulación de demanda.
--   eneba-affiliate-pilot: una sola fila con contrato propio del productor.
--   Cualquier scope no listado (lista de permitidos, no de prohibidos).
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sweep_expired_shared_cache(p_cutoff timestamptz, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog SET lock_timeout = '500ms' SET statement_timeout = '15s'
AS $$
DECLARE
  sweepable constant text[] := ARRAY[
    'search-response-v2', 'search-response',
    'product-detail-v3', 'product-detail',
    'home-sections', 'popular-products',
    'price-index',
    'jev-identity-offer', 'jev-identity',
    'store-scrape-circuit'
  ];
  removed_total integer;
  removed_by_scope jsonb;
BEGIN
  IF p_cutoff IS NULL OR NOT isfinite(p_cutoff)
    OR p_cutoff > statement_timestamp() - interval '5 minutes'
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'SHARED_CACHE_SWEEP_BOUNDS' USING ERRCODE = '22023';
  END IF;
  -- SKIP LOCKED: no espera a una request que esté renovando la misma clave.
  -- El DELETE vuelve a evaluar el predicado sobre la versión vigente: una renovación
  -- concurrente (upsert con expires_at nuevo) deja de cumplirlo y se conserva.
  WITH candidates AS (
    SELECT c.cache_key FROM public.api_cache_entries c
    WHERE c.scope = ANY (sweepable) AND c.expires_at < p_cutoff AND c.updated_at <= p_cutoff
    ORDER BY c.expires_at, c.cache_key
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), removed AS (
    DELETE FROM public.api_cache_entries c USING candidates k
    WHERE c.cache_key = k.cache_key
      AND c.scope = ANY (sweepable) AND c.expires_at < p_cutoff AND c.updated_at <= p_cutoff
    RETURNING c.scope
  ), grouped AS (
    SELECT scope, count(*)::integer AS n FROM removed GROUP BY scope
  )
  SELECT coalesce(sum(n), 0)::integer, coalesce(jsonb_object_agg(scope, n), '{}'::jsonb)
    INTO removed_total, removed_by_scope FROM grouped;
  RETURN jsonb_build_object('removed', removed_total, 'limit', p_limit,
    'cutoff', to_char(p_cutoff AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'by_scope', removed_by_scope, 'may_have_more', removed_total = p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_shared_cache(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_shared_cache(timestamptz, integer) TO service_role;
