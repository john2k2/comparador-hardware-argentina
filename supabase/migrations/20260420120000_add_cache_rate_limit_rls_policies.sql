-- Migration: Add missing RLS policies for api_cache_entries and api_rate_limits
-- Date: 2026-04-20
-- Issue: Tables have RLS enabled but no policies were created in previous migration

begin;

-- api_cache_entries: Allow service_role to read/write (used by rate limiting system)
drop policy if exists "service_api_cache_entries_select" on public.api_cache_entries;
create policy "service_api_cache_entries_select"
on public.api_cache_entries
for select
to service_role
using (true);

drop policy if exists "service_api_cache_entries_insert" on public.api_cache_entries;
create policy "service_api_cache_entries_insert"
on public.api_cache_entries
for insert
to service_role
with check (true);

drop policy if exists "service_api_cache_entries_update" on public.api_cache_entries;
create policy "service_api_cache_entries_update"
on public.api_cache_entries
for update
to service_role
using (true);

drop policy if exists "service_api_cache_entries_delete" on public.api_cache_entries;
create policy "service_api_cache_entries_delete"
on public.api_cache_entries
for delete
to service_role
using (true);

-- api_rate_limits: Allow service_role to read/write (used by rate limiting system)
drop policy if exists "service_api_rate_limits_select" on public.api_rate_limits;
create policy "service_api_rate_limits_select"
on public.api_rate_limits
for select
to service_role
using (true);

drop policy if exists "service_api_rate_limits_insert" on public.api_rate_limits;
create policy "service_api_rate_limits_insert"
on public.api_rate_limits
for insert
to service_role
with check (true);

drop policy if exists "service_api_rate_limits_update" on public.api_rate_limits;
create policy "service_api_rate_limits_update"
on public.api_rate_limits
for update
to service_role
using (true);

drop policy if exists "service_api_rate_limits_delete" on public.api_rate_limits;
create policy "service_api_rate_limits_delete"
on public.api_rate_limits
for delete
to service_role
using (true);

-- Cleanup policy para autolimpieza de entradas expiradas
drop policy if exists "service_api_rate_limits_cleanup" on public.api_rate_limits;
create policy "service_api_rate_limits_cleanup"
on public.api_rate_limits
for delete
to service_role
using (window_end <= now() - interval '1 day');

comment on policy "service_api_cache_entries_select" on public.api_cache_entries
is 'Allow service_role to read cache entries for rate limiting and caching system';

comment on policy "service_api_rate_limits_select" on public.api_rate_limits
is 'Allow service_role to read rate limit counters for distributed rate limiting';

commit;
