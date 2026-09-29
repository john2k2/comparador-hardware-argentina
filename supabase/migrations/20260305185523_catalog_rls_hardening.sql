begin;

alter table if exists public.stores enable row level security;
alter table if exists public.categories enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.product_prices enable row level security;
alter table if exists public.price_history enable row level security;
alter table if exists public.product_title_normalizations enable row level security;

drop policy if exists "catalog_read_stores" on public.stores;
create policy "catalog_read_stores"
on public.stores
for select
to anon, authenticated
using (true);

drop policy if exists "catalog_read_categories" on public.categories;
create policy "catalog_read_categories"
on public.categories
for select
to anon, authenticated
using (true);

drop policy if exists "catalog_read_products" on public.products;
create policy "catalog_read_products"
on public.products
for select
to anon, authenticated
using (true);

drop policy if exists "catalog_read_product_prices" on public.product_prices;
create policy "catalog_read_product_prices"
on public.product_prices
for select
to anon, authenticated
using (true);

-- Keep these tables private by default (no anon/authenticated policies):
drop policy if exists "catalog_read_price_history" on public.price_history;
drop policy if exists "catalog_read_product_title_normalizations" on public.product_title_normalizations;

commit;
