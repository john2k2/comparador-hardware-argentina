begin;

create table if not exists public.api_cache_entries (
  cache_key text primary key,
  scope text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_cache_entries_scope_idx on public.api_cache_entries (scope);
create index if not exists api_cache_entries_expires_idx on public.api_cache_entries (expires_at);

alter table public.api_cache_entries enable row level security;

drop policy if exists "private_api_cache_entries" on public.api_cache_entries;

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  count integer not null,
  window_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_window_end_idx on public.api_rate_limits (window_end);

alter table public.api_rate_limits enable row level security;

drop policy if exists "private_api_rate_limits" on public.api_rate_limits;

create or replace function public.check_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  now_ts timestamptz := now();
  reset_ts timestamptz;
  current_count integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'check_api_rate_limit requires positive limit and window';
  end if;

  delete from public.api_rate_limits
  where window_end <= now_ts - interval '1 day';

  loop
    update public.api_rate_limits
    set
      count = case
        when window_end <= now_ts then 1
        else count + 1
      end,
      window_end = case
        when window_end <= now_ts then now_ts + make_interval(secs => p_window_seconds)
        else window_end
      end,
      updated_at = now_ts
    where bucket_key = p_bucket_key
    returning count, window_end into current_count, reset_ts;

    if found then
      exit;
    end if;

    begin
      insert into public.api_rate_limits (bucket_key, count, window_end, updated_at)
      values (p_bucket_key, 1, now_ts + make_interval(secs => p_window_seconds), now_ts)
      returning count, window_end into current_count, reset_ts;
      exit;
    exception
      when unique_violation then
        -- retry
    end;
  end loop;

  if current_count > p_limit then
    return jsonb_build_object(
      'allowed', false,
      'limit', p_limit,
      'remaining', 0,
      'resetAtMs', floor(extract(epoch from reset_ts) * 1000)::bigint,
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from reset_ts - now_ts))::int)
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'limit', p_limit,
    'remaining', greatest(0, p_limit - current_count),
    'resetAtMs', floor(extract(epoch from reset_ts) * 1000)::bigint,
    'retryAfterSeconds', greatest(1, ceil(extract(epoch from reset_ts - now_ts))::int)
  );
end;
$$;

comment on function public.check_api_rate_limit(text, integer, integer)
is 'Rate limiting distribuido para APIs publicas usando Supabase.';

commit;
