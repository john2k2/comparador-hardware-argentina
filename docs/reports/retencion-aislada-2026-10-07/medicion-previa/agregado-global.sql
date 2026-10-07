-- Medición: sólo agregados. El corte clasifica antigüedad; no modifica la tabla.
begin read only;
set local statement_timeout='3s';
set local time zone 'UTC';
with limits as (
 select timestamptz '2026-10-07T15:45:00Z' as cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '14 days' as raw_cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '90 days' as hourly_cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '365 days' as daily_cutoff
), hours as (
 select ph.product_id,ph.store_id,coalesce(ph.offer_url,'') as offer_key,
 date_trunc('hour',ph.recorded_at) as hour_bucket,
 max(ph.recorded_at) as latest_recorded_at,
 count(*) as total_rows,
 count(*) filter(where ph.recorded_at>=l.raw_cutoff) as raw_rows,
 count(*) filter(where ph.recorded_at<l.raw_cutoff and ph.recorded_at>=l.hourly_cutoff) as hourly_rows,
 count(*) filter(where ph.recorded_at<l.hourly_cutoff and ph.recorded_at>=l.daily_cutoff) as daily_rows,
 count(*) filter(where ph.recorded_at<l.daily_cutoff) as old_rows,
 count(*) filter(where ph.recorded_at>l.cutoff) as after_cutoff_rows
 from public.price_history ph cross join limits l
 group by ph.product_id,ph.store_id,coalesce(ph.offer_url,''),date_trunc('hour',ph.recorded_at)
), days as (
 select h.product_id,h.store_id,h.offer_key,date_trunc('day',h.hour_bucket) as day_bucket,
 sum(h.total_rows) as total_rows,sum(h.raw_rows) as raw_rows,sum(h.hourly_rows) as hourly_rows,
 sum(h.daily_rows) as daily_rows,sum(h.old_rows) as old_rows,sum(h.after_cutoff_rows) as after_cutoff_rows,
 sum(h.hourly_rows-case when h.latest_recorded_at>=l.hourly_cutoff and h.latest_recorded_at<l.raw_cutoff then 1 else 0 end) as hourly_candidates,
 sum(h.daily_rows)-case when max(h.latest_recorded_at)>=max(l.daily_cutoff) and max(h.latest_recorded_at)<max(l.hourly_cutoff) then 1 else 0 end as daily_candidates,
 count(*) as hourly_groups
 from hours h cross join limits l
 group by h.product_id,h.store_id,h.offer_key,date_trunc('day',h.hour_bucket)
)
select jsonb_build_object(
 'captured_at',clock_timestamp(),'cutoff','2026-10-07T15:45:00Z','timezone',current_setting('TimeZone'),
 'total_rows',coalesce(sum(d.total_rows),0),'raw_rows',coalesce(sum(d.raw_rows),0),
 'hourly_rows',coalesce(sum(d.hourly_rows),0),'daily_rows',coalesce(sum(d.daily_rows),0),'old_rows',coalesce(sum(d.old_rows),0),
 'raw_candidates',0,'hourly_candidates',coalesce(sum(d.hourly_candidates),0),'daily_candidates',coalesce(sum(d.daily_candidates),0),'old_candidates',coalesce(sum(d.old_rows),0),
 'total_candidates',coalesce(sum(d.hourly_candidates+d.daily_candidates+d.old_rows),0),
 'remaining_rows',coalesce(sum(d.total_rows-d.hourly_candidates-d.daily_candidates-d.old_rows),0),
 'after_cutoff_rows',coalesce(sum(d.after_cutoff_rows),0),'hourly_groups',coalesce(sum(d.hourly_groups),0),'daily_groups',count(*),
 'database_bytes',pg_database_size(current_database()),'cache_total_bytes',pg_total_relation_size('public.api_cache_entries'),
 'history_total_bytes',pg_total_relation_size('public.price_history')
) as measurement
from days d;
rollback;
