begin;

create extension if not exists pgcrypto;

drop table if exists public.price_history cascade;
drop table if exists public.scraped_products cascade;
drop table if exists public.product_prices cascade;
drop table if exists public.products cascade;
drop table if exists public.categories cascade;
drop table if exists public.stores cascade;

drop function if exists public.set_updated_at() cascade;

create table public.stores (
  id text primary key,
  name text not null,
  logo text not null default '/pixel-box.svg',
  url text not null,
  color text not null default '#64748b',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index stores_url_unique_idx on public.stores (url);

create table public.categories (
  id text primary key,
  name text not null,
  icon text not null,
  slug text not null unique,
  parent_category text null references public.categories(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id text primary key,
  name text not null,
  category text not null references public.categories(id) on update cascade on delete restrict,
  brand text not null default 'Generica',
  model text not null,
  description text null,
  image text null,
  specs jsonb not null default '{}'::jsonb,
  lowest_price numeric(14, 2) not null default 0,
  highest_price numeric(14, 2) not null default 0,
  average_price numeric(14, 2) not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on update cascade on delete cascade,
  store_id text not null references public.stores(id) on update cascade on delete restrict,
  url text not null,
  price numeric(14, 2) not null check (price >= 0),
  original_price numeric(14, 2) null,
  stock text not null default 'unknown' check (stock in ('in-stock', 'low-stock', 'out-of-stock', 'unknown')),
  installment_count integer null check (installment_count is null or installment_count > 0),
  installment_amount numeric(14, 2) null,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, store_id, url)
);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on update cascade on delete cascade,
  store_id text not null references public.stores(id) on update cascade on delete restrict,
  price numeric(14, 2) not null check (price >= 0),
  original_price numeric(14, 2) null,
  stock text not null default 'unknown' check (stock in ('in-stock', 'low-stock', 'out-of-stock', 'unknown')),
  recorded_at timestamptz not null default now()
);

create index products_category_idx on public.products (category);
create index products_updated_at_idx on public.products (updated_at desc);
create index product_prices_product_id_idx on public.product_prices (product_id);
create index product_prices_store_id_idx on public.product_prices (store_id);
create index product_prices_last_updated_idx on public.product_prices (last_updated desc);
create index price_history_product_recorded_idx on public.price_history (product_id, recorded_at desc);
create index price_history_store_recorded_idx on public.price_history (store_id, recorded_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_set_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger product_prices_set_updated_at
before update on public.product_prices
for each row execute function public.set_updated_at();

insert into public.stores (id, name, logo, url, color, is_active)
values
  ('mexx', 'Mexx', '/pixel-box.svg', 'https://www.mexx.com.ar', '#f97316', true),
  ('venex', 'Venex', '/pixel-box.svg', 'https://www.venex.com.ar', '#fb8c00', true),
  ('fullh4rd', 'FullH4rd', '/pixel-box.svg', 'https://www.fullh4rd.com.ar', '#22c55e', true),
  ('compragamer', 'CompraGamer', '/pixel-box.svg', 'https://www.compragamer.com', '#06b6d4', true),
  ('maximus', 'Maximus', '/pixel-box.svg', 'https://www.maximus.com.ar', '#3b82f6', true),
  ('gezatek', 'Gezatek', '/pixel-box.svg', 'https://www.gezatek.com.ar', '#14b8a6', true),
  ('compugarden', 'Compugarden', '/pixel-box.svg', 'https://www.compugarden.com.ar', '#16a34a', true),
  ('katech', 'Katech', '/pixel-box.svg', 'https://katech.com.ar', '#64748b', true),
  ('dinobyte', 'Dinobyte', '/pixel-box.svg', 'https://dinobyte.ar', '#8b5cf6', true),
  ('maxtecno', 'MaxTecno', '/pixel-box.svg', 'https://maxtecno.com.ar', '#ec4899', true),
  ('thegamershop', 'The Gamer Shop', '/pixel-box.svg', 'https://thegamershop.com.ar', '#ef4444', true),
  ('hardcore', 'Hardcore', '/pixel-box.svg', 'https://hardcorecomputacion.com.ar', '#f43f5e', true),
  ('goldentechstore', 'Golden Tech', '/pixel-box.svg', 'https://goldentechstore.com.ar', '#f59e0b', true)
on conflict (id) do update
set
  name = excluded.name,
  logo = excluded.logo,
  url = excluded.url,
  color = excluded.color,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.categories (id, name, icon, slug, parent_category)
values
  ('procesadores', 'Procesadores', 'cpu', 'procesadores', null),
  ('tarjetas-graficas', 'Tarjetas Graficas', 'monitor', 'tarjetas-graficas', null),
  ('motherboards', 'Motherboards', 'hard-drive', 'motherboards', null),
  ('memoria-ram', 'Memoria RAM', 'memory', 'memoria-ram', null),
  ('almacenamiento', 'Almacenamiento', 'hdd', 'almacenamiento', null),
  ('fuentes-alimentacion', 'Fuentes de Alimentacion', 'zap', 'fuentes', null),
  ('gabinetes', 'Gabinetes', 'box', 'gabinetes', null),
  ('refrigeracion', 'Refrigeracion', 'thermometer', 'refrigeracion', null)
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  slug = excluded.slug,
  parent_category = excluded.parent_category,
  updated_at = now();

commit;
