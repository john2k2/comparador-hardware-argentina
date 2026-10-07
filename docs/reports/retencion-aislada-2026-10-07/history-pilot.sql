-- PROPUESTA LOCAL. No ejecutar en producción sin autorización específica.
-- Hasta 250 borrados por lote; hasta cuatro commits/1000, controlados por operador.
-- Cursor sólo avanza después de ACK y COMMIT conciliado. ROLLBACK por defecto.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '3s';
SET LOCAL lock_timeout = '200ms';
SET LOCAL idle_in_transaction_session_timeout = '10s';
DO $$
DECLARE
  batch_ordinal integer := nullif(current_setting('app.history_cleanup_batch', true), '')::integer;
  prior_deleted integer := nullif(current_setting('app.history_cleanup_prior_deleted', true), '')::integer;
BEGIN
  IF current_setting('app.history_cleanup_approved', true)
      IS DISTINCT FROM 'history-retention-2026-10-07-v1' THEN
    RAISE EXCEPTION 'HISTORY_CLEANUP_REQUIRES_EXPLICIT_APPROVAL';
  END IF;
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'HISTORY_CLEANUP_OPERATOR_ROLE_REQUIRED';
  END IF;
  IF batch_ordinal IS NULL OR batch_ordinal NOT BETWEEN 1 AND 4
    OR prior_deleted IS NULL OR prior_deleted < 0
    OR prior_deleted > (batch_ordinal - 1) * 250 THEN
    RAISE EXCEPTION 'HISTORY_CLEANUP_OPERATOR_LEDGER_REQUIRED';
  END IF;
  -- Un DELETE con triggers/reglas/cascadas salientes exige revisión separada.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.price_history'::regclass
      AND NOT tgisinternal AND tgenabled <> 'D' AND (tgtype::integer & 8) <> 0)
    OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class = 'public.price_history'::regclass
      AND ev_type = '4')
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f'
      AND confrelid = 'public.price_history'::regclass AND confdeltype <> 'a' AND confdeltype <> 'r') THEN
    RAISE EXCEPTION 'HISTORY_CLEANUP_SIDE_EFFECT_REVIEW_REQUIRED';
  END IF;
END $$;

WITH settings AS MATERIALIZED (
  SELECT '2026-10-07T15:45:00Z'::timestamptz AS cutoff,
    nullif(current_setting('app.history_cleanup_cursor', true), '')::uuid AS cursor_from,
    1000 AS window_limit, 250 AS batch_limit
), scanned AS MATERIALIZED (
  SELECT ph.id, ph.product_id, ph.store_id, ph.offer_url, ph.recorded_at
  FROM public.price_history ph CROSS JOIN settings s
  WHERE ph.id >= coalesce(s.cursor_from, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (s.cursor_from IS NULL OR ph.id > s.cursor_from)
  ORDER BY ph.id LIMIT 1000
), classified AS MATERIALIZED (
  SELECT ph.*, s.cutoff,
    CASE WHEN ph.recorded_at >= s.cutoff - interval '365 days'
        AND ph.recorded_at < s.cutoff - interval '14 days'
      THEN date_trunc(CASE WHEN ph.recorded_at >= s.cutoff - interval '90 days'
        THEN 'hour' ELSE 'day' END, ph.recorded_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      END AS bucket_start,
    CASE WHEN ph.recorded_at >= s.cutoff - interval '90 days'
      THEN interval '1 hour' ELSE interval '1 day' END AS bucket_width
  FROM scanned ph CROSS JOIN settings s
), eligible AS MATERIALIZED (
  SELECT c.id, keeper.id AS keeper_id
  FROM classified c
  LEFT JOIN LATERAL (
    -- Considera todo el bucket, incluso un keeper en la franja más reciente.
    SELECT peer.id FROM public.price_history peer
    WHERE c.bucket_start IS NOT NULL AND peer.product_id = c.product_id
      AND peer.store_id = c.store_id AND coalesce(peer.offer_url, '') = coalesce(c.offer_url, '')
      AND peer.recorded_at >= c.bucket_start
      AND peer.recorded_at < c.bucket_start + c.bucket_width
      AND (peer.recorded_at, peer.id) > (c.recorded_at, c.id)
    ORDER BY peer.recorded_at DESC, peer.id DESC LIMIT 1
  ) keeper ON true
  WHERE c.recorded_at < c.cutoff - interval '365 days' OR keeper.id IS NOT NULL
), selected AS MATERIALIZED (
  SELECT id, keeper_id FROM eligible ORDER BY id LIMIT 250
), locked_keepers AS MATERIALIZED (
  -- SHARE impide mover o borrar al keeper mientras se eliminan duplicados.
  SELECT ph.id FROM public.price_history ph
  JOIN (SELECT DISTINCT keeper_id FROM selected WHERE keeper_id IS NOT NULL) k ON ph.id = k.keeper_id
  ORDER BY ph.id FOR SHARE OF ph
), locked_candidates AS MATERIALIZED (
  SELECT ph.id FROM public.price_history ph JOIN selected s ON ph.id = s.id
  WHERE (SELECT count(*) FROM locked_keepers) = (SELECT count(DISTINCT keeper_id) FROM selected)
  ORDER BY ph.id FOR UPDATE OF ph
), deleted AS (
  DELETE FROM public.price_history ph USING locked_candidates c
  WHERE ph.id = c.id RETURNING ph.id
)
SELECT set_config('app.history_cleanup_receipt', jsonb_build_object(
  'operation', 'history-retention-2026-10-07-v1',
  'executedAt', clock_timestamp(), 'cutoff', s.cutoff,
  'policy', jsonb_build_object('keepRawDays', 14, 'keepHourlyDays', 90, 'keepDailyDays', 365, 'timezone', 'UTC'),
  'windowLimit', s.window_limit, 'batchLimit', s.batch_limit,
  'batchOrdinal', current_setting('app.history_cleanup_batch')::integer,
  'priorCommittedDeletedRows', current_setting('app.history_cleanup_prior_deleted')::integer,
  'examinedRows', (SELECT count(*) FROM scanned),
  'candidateRows', (SELECT count(*) FROM eligible),
  'selectedRows', (SELECT count(*) FROM locked_candidates),
  'deletedRows', (SELECT count(*) FROM deleted),
  'batchComplete', (SELECT count(*) FROM selected) = (SELECT count(*) FROM deleted)
    AND (SELECT count(*) FROM selected) = (SELECT count(*) FROM locked_candidates),
  'cursorFrom', s.cursor_from,
  'cursorTo', CASE WHEN (SELECT count(*) FROM selected) <> (SELECT count(*) FROM deleted)
      OR (SELECT count(*) FROM selected) <> (SELECT count(*) FROM locked_candidates) THEN s.cursor_from
    WHEN (SELECT count(*) FROM eligible) > s.batch_limit
    THEN (SELECT id FROM deleted ORDER BY id DESC LIMIT 1)
    ELSE coalesce((SELECT id FROM scanned ORDER BY id DESC LIMIT 1), s.cursor_from) END,
  'lastExaminedId', (SELECT id FROM scanned ORDER BY id DESC LIMIT 1),
  'moreCandidatesInWindow', (SELECT count(*) FROM eligible) > (SELECT count(*) FROM deleted),
  'scanReachedEndAtSnapshot', (SELECT count(*) FROM scanned) < s.window_limit,
  'globalEligibilityUnknown', true,
  'transactionOutcome', 'pending; default terminator ROLLBACK'
)::text, true) AS receipt FROM settings s;
DO $$
BEGIN
  IF (current_setting('app.history_cleanup_receipt')::jsonb ->> 'batchComplete')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'HISTORY_CLEANUP_INCOMPLETE_BATCH';
  END IF;
END $$;
ROLLBACK;
