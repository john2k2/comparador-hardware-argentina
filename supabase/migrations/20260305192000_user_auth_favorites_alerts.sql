begin;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  store_id text null references public.stores(id) on update cascade on delete set null,
  trigger_mode text not null default 'new_low'
    check (trigger_mode in ('new_low', 'any_drop', 'target_price')),
  target_price numeric(14, 2) null check (target_price is null or target_price > 0),
  is_active boolean not null default true,
  last_triggered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (trigger_mode <> 'target_price')
    or (target_price is not null)
  )
);

create index if not exists idx_user_favorites_user_id
  on public.user_favorites (user_id);

create index if not exists idx_user_favorites_product_id
  on public.user_favorites (product_id);

create index if not exists idx_price_alerts_user_id
  on public.price_alerts (user_id);

create index if not exists idx_price_alerts_product_id
  on public.price_alerts (product_id);

create index if not exists idx_price_alerts_active
  on public.price_alerts (is_active, updated_at desc);

insert into public.user_profiles (user_id, email, display_name, created_at, updated_at)
select
  u.id,
  u.email,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ) as display_name,
  now(),
  now()
from auth.users u
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, display_name, avatar_url, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    now(),
    now()
  )
  on conflict (user_id)
  do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.user_profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_favorites_set_updated_at on public.user_favorites;
create trigger user_favorites_set_updated_at
before update on public.user_favorites
for each row execute function public.set_updated_at();

drop trigger if exists price_alerts_set_updated_at on public.price_alerts;
create trigger price_alerts_set_updated_at
before update on public.price_alerts
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.user_favorites enable row level security;
alter table public.price_alerts enable row level security;

drop policy if exists "profiles_select_own" on public.user_profiles;
create policy "profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.user_profiles;
create policy "profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.user_profiles;
create policy "profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "favorites_select_own" on public.user_favorites;
create policy "favorites_select_own"
on public.user_favorites
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.user_favorites;
create policy "favorites_insert_own"
on public.user_favorites
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "favorites_update_own" on public.user_favorites;
create policy "favorites_update_own"
on public.user_favorites
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.user_favorites;
create policy "favorites_delete_own"
on public.user_favorites
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "alerts_select_own" on public.price_alerts;
create policy "alerts_select_own"
on public.price_alerts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "alerts_insert_own" on public.price_alerts;
create policy "alerts_insert_own"
on public.price_alerts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "alerts_update_own" on public.price_alerts;
create policy "alerts_update_own"
on public.price_alerts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "alerts_delete_own" on public.price_alerts;
create policy "alerts_delete_own"
on public.price_alerts
for delete
to authenticated
using (auth.uid() = user_id);

commit;
