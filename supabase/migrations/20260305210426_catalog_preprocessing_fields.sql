begin;

create extension if not exists pg_trgm;

alter table public.products
  add column if not exists normalized_title text null,
  add column if not exists canonical_product_key text null,
  add column if not exists family_key text null,
  add column if not exists variant_key text null,
  add column if not exists refresh_priority text not null default 'normal'
    check (refresh_priority in ('tracked', 'hot', 'normal', 'cold')),
  add column if not exists last_scraped_at timestamptz not null default now(),
  add column if not exists last_normalized_at timestamptz null;

create index if not exists products_canonical_product_key_idx
  on public.products (canonical_product_key);

create index if not exists products_family_key_idx
  on public.products (family_key);

create index if not exists products_refresh_priority_last_scraped_idx
  on public.products (refresh_priority, last_scraped_at desc);

create index if not exists products_normalized_title_trgm_idx
  on public.products using gin (normalized_title gin_trgm_ops);

update public.products
set
  normalized_title = coalesce(normalized_title, name),
  last_scraped_at = coalesce(last_scraped_at, updated_at, now()),
  refresh_priority = coalesce(refresh_priority, 'normal')
where normalized_title is null
   or last_scraped_at is null
   or refresh_priority is null;

commit;
