-- Medición acotada a franjas/buckets relevantes, sin ordenar ni exportar filas.
begin read only;
set local statement_timeout='3s';
set local time zone 'UTC';
with limits as (
 select timestamptz '2026-10-07T15:45:00Z' as cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '14 days' as raw_cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '90 days' as hourly_cutoff,
 timestamptz '2026-10-07T15:45:00Z'-interval '365 days' as daily_cutoff
), groups as (
 select ph.product_id,ph.store_id,coalesce(ph.offer_url,'') as offer_key,b.kind,b.bucket,
 max(ph.recorded_at) as latest_recorded_at,
 count(*) filter(where ph.recorded_at>=b.lower_bound and ph.recorded_at<b.upper_bound) as eligible_rows,
 max(b.lower_bound) as lower_bound,max(b.upper_bound) as upper_bound
 from public.price_history ph cross join limits l
 cross join lateral (
  values ('hourly',date_trunc('hour',ph.recorded_at),l.hourly_cutoff,l.raw_cutoff,
          date_trunc('hour',l.hourly_cutoff),date_trunc('hour',l.raw_cutoff)+interval '1 hour'),
         ('daily',date_trunc('day',ph.recorded_at),l.daily_cutoff,l.hourly_cutoff,
          date_trunc('day',l.daily_cutoff),date_trunc('day',l.hourly_cutoff)+interval '1 day')
 ) b(kind,bucket,lower_bound,upper_bound,bucket_lower,bucket_upper)
 where ph.recorded_at>=date_trunc('day',l.daily_cutoff)
 and ph.recorded_at<date_trunc('hour',l.raw_cutoff)+interval '1 hour'
 and ph.recorded_at>=b.bucket_lower and ph.recorded_at<b.bucket_upper
 group by ph.product_id,ph.store_id,coalesce(ph.offer_url,''),b.kind,b.bucket
), candidates as (
 select coalesce(sum(eligible_rows-case when latest_recorded_at>=lower_bound and latest_recorded_at<upper_bound then 1 else 0 end) filter(where kind='hourly'),0) as hourly_candidates,
 coalesce(sum(eligible_rows-case when latest_recorded_at>=lower_bound and latest_recorded_at<upper_bound then 1 else 0 end) filter(where kind='daily'),0) as daily_candidates,
 count(*) filter(where kind='hourly') as hourly_groups,count(*) filter(where kind='daily') as daily_groups
 from groups
), counts as (
 select count(*) as total_rows,
 count(*) filter(where ph.recorded_at>=l.raw_cutoff) as raw_rows,
 count(*) filter(where ph.recorded_at<l.raw_cutoff and ph.recorded_at>=l.hourly_cutoff) as hourly_rows,
 count(*) filter(where ph.recorded_at<l.hourly_cutoff and ph.recorded_at>=l.daily_cutoff) as daily_rows,
 count(*) filter(where ph.recorded_at<l.daily_cutoff) as old_rows,
 count(*) filter(where ph.recorded_at>l.cutoff) as after_cutoff_rows
 from public.price_history ph cross join limits l
)
select jsonb_build_object(
 'captured_at',clock_timestamp(),'cutoff','2026-10-07T15:45:00Z','timezone',current_setting('TimeZone'),
 'total_rows',n.total_rows,'raw_rows',n.raw_rows,'hourly_rows',n.hourly_rows,'daily_rows',n.daily_rows,'old_rows',n.old_rows,
 'raw_candidates',0,'hourly_candidates',c.hourly_candidates,'daily_candidates',c.daily_candidates,'old_candidates',n.old_rows,
 'total_candidates',c.hourly_candidates+c.daily_candidates+n.old_rows,
 'remaining_rows',n.total_rows-c.hourly_candidates-c.daily_candidates-n.old_rows,
 'after_cutoff_rows',n.after_cutoff_rows,'hourly_groups',c.hourly_groups,'daily_groups',c.daily_groups,
 'database_bytes',pg_database_size(current_database()),'cache_total_bytes',pg_total_relation_size('public.api_cache_entries'),
 'history_total_bytes',pg_total_relation_size('public.price_history')
) as measurement from counts n cross join candidates c;
rollback;
