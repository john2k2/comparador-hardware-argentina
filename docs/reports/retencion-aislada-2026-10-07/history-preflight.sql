-- Lectura agregada acotada; no RPC, DDL, borrados ni exportación de filas.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '3s';
SET LOCAL lock_timeout = '200ms';
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
)
SELECT jsonb_build_object(
  'operation', 'history-retention-preflight-2026-10-07-v1',
  'readAt', clock_timestamp(), 'cutoff', s.cutoff,
  'policy', jsonb_build_object('keepRawDays', 14, 'keepHourlyDays', 90, 'keepDailyDays', 365, 'timezone', 'UTC'),
  'windowLimit', s.window_limit, 'batchLimit', s.batch_limit,
  'examinedRows', (SELECT count(*) FROM scanned),
  'candidateRows', (SELECT count(*) FROM eligible),
  'rawOrFutureRowsInWindow', (SELECT count(*) FROM scanned WHERE recorded_at >= s.cutoff - interval '14 days'),
  'expiredRowsInWindow', (SELECT count(*) FROM scanned WHERE recorded_at < s.cutoff - interval '365 days'),
  'scanReachedEndAtSnapshot', (SELECT count(*) FROM scanned) < s.window_limit,
  'globalEligibilityUnknown', true,
  'operatorRole', current_user,
  'operatorCanSelect', has_table_privilege(current_user, 'public.price_history', 'SELECT'),
  'operatorCanLock', has_table_privilege(current_user, 'public.price_history', 'UPDATE'),
  'operatorCanDelete', has_table_privilege(current_user, 'public.price_history', 'DELETE'),
  'historyHeapBytes', pg_relation_size('public.price_history'),
  'historyTotalBytes', pg_total_relation_size('public.price_history'),
  'historyIndexesBytes', pg_indexes_size('public.price_history'),
  'enabledDeleteTriggers', (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.price_history'::regclass
    AND NOT tgisinternal AND tgenabled <> 'D' AND (tgtype::integer & 8) <> 0),
  'deleteRules', (SELECT count(*) FROM pg_rewrite WHERE ev_class='public.price_history'::regclass AND ev_type='4'),
  'outgoingDeleteActions', (SELECT count(*) FROM pg_constraint WHERE contype='f'
    AND confrelid='public.price_history'::regclass AND confdeltype NOT IN ('a','r')),
  'historyIndexes', (SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes
    WHERE schemaname='public' AND tablename='price_history')
) AS receipt FROM settings s;
ROLLBACK;
