begin;

create or replace function public.cleanup_price_history(
  retain_recent interval default interval '14 days',
  retain_hourly interval default interval '90 days',
  retain_daily interval default interval '365 days'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  executed_at timestamptz := now();
  recent_cutoff timestamptz := executed_at - retain_recent;
  hourly_cutoff timestamptz := executed_at - retain_hourly;
  daily_cutoff timestamptz := executed_at - retain_daily;
  before_rows bigint := 0;
  remaining_rows bigint := 0;
  deleted_rows bigint := 0;
begin
  if retain_recent <= interval '0' or retain_hourly <= interval '0' or retain_daily <= interval '0' then
    raise exception 'cleanup_price_history intervals must be positive';
  end if;

  if not (retain_recent < retain_hourly and retain_hourly < retain_daily) then
    raise exception 'cleanup_price_history requires retain_recent < retain_hourly < retain_daily';
  end if;

  select count(*) into before_rows from public.price_history;

  with ranked as (
    select
      ph.id,
      ph.recorded_at,
      row_number() over (
        partition by ph.product_id, ph.store_id, date_trunc('hour', ph.recorded_at)
        order by ph.recorded_at desc, ph.id desc
      ) as hourly_rank,
      row_number() over (
        partition by ph.product_id, ph.store_id, date_trunc('day', ph.recorded_at)
        order by ph.recorded_at desc, ph.id desc
      ) as daily_rank
    from public.price_history ph
  ),
  deleted as (
    delete from public.price_history ph
    using ranked
    where ph.id = ranked.id
      and (
        ranked.recorded_at < daily_cutoff
        or (
          ranked.recorded_at < hourly_cutoff
          and ranked.recorded_at >= daily_cutoff
          and ranked.daily_rank > 1
        )
        or (
          ranked.recorded_at < recent_cutoff
          and ranked.recorded_at >= hourly_cutoff
          and ranked.hourly_rank > 1
        )
      )
    returning 1
  )
  select count(*) into deleted_rows from deleted;

  select count(*) into remaining_rows from public.price_history;

  return jsonb_build_object(
    'deletedRows', deleted_rows,
    'beforeRows', before_rows,
    'remainingRows', remaining_rows,
    'policy', jsonb_build_object(
      'keepRawDays', extract(day from retain_recent)::int,
      'keepHourlyDays', extract(day from retain_hourly)::int,
      'keepDailyDays', extract(day from retain_daily)::int
    ),
    'executedAt', executed_at
  );
end;
$$;

comment on function public.cleanup_price_history(interval, interval, interval)
is 'Mantiene price_history con politica por ventanas: raw reciente, hourly intermedio, daily historico y purge de muy viejo.';

commit;
