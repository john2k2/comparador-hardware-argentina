-- Ventana determinista de hasta 1000 filas antiguas. Sólo devuelve agregados.
begin read only;
set local statement_timeout='3s';
set local time zone 'UTC';
explain (format json, analyze false)
with limits as (
 select timestamptz '2026-10-07T15:45:00Z' as cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '14 days' as raw_cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '90 days' as hourly_cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '365 days' as daily_cutoff
), sample as materialized (
 select ph.id,ph.product_id,ph.store_id,ph.offer_url,ph.recorded_at,
 case when ph.recorded_at<l.daily_cutoff then 'old'
      when ph.recorded_at<l.hourly_cutoff then 'daily' else 'hourly' end as band,
 case when ph.recorded_at<l.hourly_cutoff then date_trunc('day',ph.recorded_at)
      else date_trunc('hour',ph.recorded_at) end as bucket_start,
 case when ph.recorded_at<l.hourly_cutoff then interval '1 day'
      else interval '1 hour' end as bucket_width
 from public.price_history ph cross join limits l
 where ph.recorded_at<l.raw_cutoff
 order by ph.id
 limit 1000
), marked as (
 select s.band,
 case when s.band='old' then true else exists(
  select 1 from public.price_history newer
  where newer.product_id=s.product_id and newer.store_id=s.store_id
  and coalesce(newer.offer_url,'')=coalesce(s.offer_url,'')
  and newer.recorded_at>=s.bucket_start and newer.recorded_at<s.bucket_start+s.bucket_width
  and (newer.recorded_at,newer.id)>(s.recorded_at,s.id)
 ) end as compactable
 from sample s
)
select jsonb_build_object(
 'started_at',statement_timestamp(),'captured_at',clock_timestamp(),
 'server_elapsed_ms',extract(epoch from(clock_timestamp()-statement_timestamp()))*1000,
 'cutoff','2026-10-07T15:45:00Z','timezone',current_setting('TimeZone'),
 'scope','first 1000 ids ascending where recorded_at < cutoff minus 14 days',
 'window_limit',1000,'window_rows',count(*),'window_raw_rows',0,
 'window_hourly_rows',count(*) filter(where band='hourly'),
 'window_daily_rows',count(*) filter(where band='daily'),
 'window_old_rows',count(*) filter(where band='old'),
 'window_raw_candidates',0,
 'window_hourly_candidates',count(*) filter(where band='hourly' and compactable),
 'window_daily_candidates',count(*) filter(where band='daily' and compactable),
 'window_old_candidates',count(*) filter(where band='old' and compactable),
 'window_total_candidates',count(*) filter(where compactable),
 'window_remaining_rows',count(*) filter(where not compactable),
 'global_total_candidates',null,
 'database_bytes',pg_database_size(current_database()),'cache_total_bytes',pg_total_relation_size('public.api_cache_entries'),
 'history_total_bytes',pg_total_relation_size('public.price_history')
) as measurement from marked;
rollback;
