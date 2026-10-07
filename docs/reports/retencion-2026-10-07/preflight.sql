-- Sólo metadatos/agregados; no exportar cache_key, payload, usuarios ni queries.
BEGIN READ ONLY;
SET LOCAL statement_timeout='3s';
SELECT clock_timestamp() AS read_at,
  '2026-10-07T14:30:00Z'::timestamptz AS cutoff,
  count(*) FILTER(WHERE scope='operational-store-event'
    AND expires_at<'2026-10-07T14:30:00Z'
    AND updated_at<='2026-10-07T14:30:00Z') AS pilot_scope_eligible,
  count(*) FILTER(WHERE expires_at>='2026-10-07T14:30:00Z') AS active_or_boundary,
  pg_database_size(current_database()) AS database_bytes,
  pg_relation_size('public.api_cache_entries') AS cache_heap_bytes,
  pg_total_relation_size('public.api_cache_entries') AS cache_total_bytes,
  pg_indexes_size('public.api_cache_entries') AS cache_indexes_bytes
FROM public.api_cache_entries;
ROLLBACK;
