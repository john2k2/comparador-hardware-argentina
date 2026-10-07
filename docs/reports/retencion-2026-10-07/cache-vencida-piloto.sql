-- BORRADOR PARA REVISIÓN. No ejecutado contra Supabase.
-- Jonathan aún NO autorizó limpieza de datos. Default: ROLLBACK.
-- Un lote <=250 filas; como máximo4 commits/1000 filas tras aprobación explícita.
-- No cambiar cutoff, scope, límites, RLS, rol ni el terminador automáticamente.
BEGIN;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='200ms';
SET LOCAL idle_in_transaction_session_timeout='10s';
DO $$ BEGIN
  IF current_setting('app.cache_cleanup_approved',true)
      IS DISTINCT FROM 'retencion-2026-10-07-pilot-v1' THEN
    RAISE EXCEPTION 'CACHE_CLEANUP_REQUIRES_EXPLICIT_APPROVAL';
  END IF;
  IF current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'CACHE_CLEANUP_OPERATOR_ROLE_REQUIRED';
  END IF;
END $$;

WITH candidates AS MATERIALIZED (
  SELECT cache_key
  FROM public.api_cache_entries
  WHERE scope='operational-store-event'
    AND expires_at < '2026-10-07T14:30:00Z'::timestamptz
    AND updated_at <= '2026-10-07T14:30:00Z'::timestamptz
  ORDER BY expires_at,cache_key
  LIMIT 250
  FOR UPDATE SKIP LOCKED
), deleted AS (
  DELETE FROM public.api_cache_entries c
  USING candidates d
  WHERE c.cache_key=d.cache_key
    AND c.scope='operational-store-event'
    AND c.expires_at < '2026-10-07T14:30:00Z'::timestamptz
    AND c.updated_at <= '2026-10-07T14:30:00Z'::timestamptz
  RETURNING 1
)
SELECT 'retencion-2026-10-07-pilot-v1' AS operation,
  '2026-10-07T14:30:00Z'::timestamptz AS cutoff,
  250 AS batch_limit,count(*) AS deleted_rows
FROM deleted;
ROLLBACK;
