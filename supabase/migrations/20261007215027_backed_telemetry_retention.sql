-- Preparación local: dos RPC exclusivas del runner; no cambia retención de precios ni usuarios.
BEGIN;

CREATE OR REPLACE FUNCTION public.select_backed_telemetry_candidates(p_cutoff timestamptz, p_limit integer)
RETURNS TABLE(cache_key text, scope text, payload_text text, expires_at text, created_at text, updated_at text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET lock_timeout = '500ms'
AS $$
DECLARE archive_bytes bigint;
BEGIN
  IF p_cutoff IS NULL OR NOT isfinite(p_cutoff)
    OR p_cutoff > statement_timestamp() - interval '5 minutes'
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 250 THEN
    RAISE EXCEPTION 'TELEMETRY_CANDIDATE_BOUNDS' USING ERRCODE = '22023';
  END IF;
  -- Tope interno conservador del contenedor completo; no supone cuota global disponible.
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'catalog-history-archive'
    AND (metadata ->> 'size' IS NULL OR metadata ->> 'size' !~ '^[0-9]{1,12}$')) THEN
    RAISE EXCEPTION 'TELEMETRY_ARCHIVE_SIZE_UNKNOWN';
  END IF;
  SELECT coalesce(sum((metadata ->> 'size')::bigint),0) INTO archive_bytes
    FROM storage.objects WHERE bucket_id = 'catalog-history-archive';
  IF archive_bytes + 3 * 1048576 > 50 * 1048576 THEN
    RAISE EXCEPTION 'TELEMETRY_ARCHIVE_CAPACITY_LIMIT';
  END IF;
  RETURN QUERY SELECT c.cache_key, c.scope, c.payload::text,
    to_char(c.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  FROM public.api_cache_entries c
  WHERE c.scope IN ('operational-endpoint-event', 'operational-store-event')
    AND c.expires_at < p_cutoff AND c.updated_at <= p_cutoff
  ORDER BY c.expires_at, c.cache_key LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_backed_telemetry(p_cutoff timestamptz, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog SET lock_timeout = '500ms'
AS $$
DECLARE
  selected_count integer;
  removed_count integer;
  removed_keys jsonb;
BEGIN
  IF p_cutoff IS NULL OR NOT isfinite(p_cutoff)
    OR p_cutoff > statement_timestamp() - interval '5 minutes'
    OR p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'array'
    OR octet_length(p_snapshot::text) > 4194304 THEN
    RAISE EXCEPTION 'TELEMETRY_RETIRE_BOUNDS' USING ERRCODE = '22023';
  END IF;
  selected_count := jsonb_array_length(p_snapshot);
  IF selected_count < 1 OR selected_count > 250
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot) x WHERE jsonb_typeof(x) <> 'object') THEN
    RAISE EXCEPTION 'TELEMETRY_RETIRE_ROWS' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_snapshot) x
    WHERE (SELECT count(*) FROM jsonb_object_keys(x)) <> 6
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['cache_key','scope','payload_text','expires_at','created_at','updated_at']) field
        WHERE jsonb_typeof(x -> field) IS DISTINCT FROM 'string')
  ) THEN
    RAISE EXCEPTION 'TELEMETRY_RETIRE_FIELDS' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT x.cache_key) FROM jsonb_to_recordset(p_snapshot)
    x(cache_key text)) <> selected_count OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_snapshot)
      x(cache_key text, scope text, payload_text text, expires_at text, created_at text, updated_at text)
    WHERE length(x.cache_key) = 0
      OR x.scope NOT IN ('operational-endpoint-event', 'operational-store-event')
      OR NOT isfinite(x.expires_at::timestamptz) OR NOT isfinite(x.created_at::timestamptz)
      OR NOT isfinite(x.updated_at::timestamptz)
      OR x.expires_at::timestamptz >= p_cutoff OR x.updated_at::timestamptz > p_cutoff
  ) THEN
    RAISE EXCEPTION 'TELEMETRY_RETIRE_SELECTION' USING ERRCODE = '22023';
  END IF;
  -- Validar también JSON de claves ya ausentes; el join no debe ocultar payloads inválidos.
  PERFORM x.payload_text::jsonb FROM jsonb_to_recordset(p_snapshot) x(payload_text text);
  -- El lock evita que se agreguen triggers/relaciones entre el control y el DELETE.
  LOCK TABLE public.api_cache_entries IN ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.api_cache_entries'::regclass AND NOT tgisinternal)
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.api_cache_entries'::regclass) THEN
    RAISE EXCEPTION 'TELEMETRY_RETIRE_SCHEMA_CHANGED';
  END IF;
  WITH snapshot AS (
    SELECT * FROM jsonb_to_recordset(p_snapshot)
      x(cache_key text, scope text, payload_text text, expires_at text, created_at text, updated_at text)
  ), removed AS (
    DELETE FROM public.api_cache_entries c USING snapshot s
    WHERE c.cache_key = s.cache_key AND c.scope = s.scope AND c.payload = s.payload_text::jsonb
      AND c.expires_at = s.expires_at::timestamptz AND c.created_at = s.created_at::timestamptz
      AND c.updated_at = s.updated_at::timestamptz
      AND c.scope IN ('operational-endpoint-event', 'operational-store-event')
      AND c.expires_at < p_cutoff AND c.updated_at <= p_cutoff
    RETURNING c.cache_key
  ) SELECT count(*)::integer, coalesce(jsonb_agg(cache_key ORDER BY cache_key), '[]'::jsonb)
    INTO removed_count, removed_keys FROM removed;
  RETURN jsonb_build_object('selected',selected_count,'removed',removed_count,
    'changed_or_missing',selected_count-removed_count,'removed_keys',removed_keys);
END;
$$;

REVOKE ALL ON FUNCTION public.select_backed_telemetry_candidates(timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retire_backed_telemetry(timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_backed_telemetry_candidates(timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.retire_backed_telemetry(timestamptz, jsonb) TO service_role;
COMMIT;
