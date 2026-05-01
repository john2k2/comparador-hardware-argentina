-- Migration: Add performance indexes for home page and catalog queries
-- Date: 2026-05-01
-- Issue: Home page loads too slowly due to large scans on products and price_history

begin;

-- Index for home page "featured products" queries (updated_at sorting)
create index if not exists products_updated_at_desc_idx on public.products (updated_at desc);

-- Index for "popular products" queries (grouped products with lowest_price > 0)
create index if not exists products_grouped_lowest_price_idx on public.products (id text_pattern_ops, lowest_price) 
  where lowest_price > 0;

-- Composite index for category filtering + price sorting (common search pattern)
create index if not exists products_category_lowest_price_idx on public.products (category, lowest_price);

-- Index for price_history time-range queries (used by price drop detection)
create index if not exists price_history_recorded_at_idx on public.price_history (recorded_at desc);

-- Index for price_history product lookups
create index if not exists price_history_product_store_idx on public.price_history (product_id, store_id, recorded_at desc);

-- Index for product_prices foreign key lookups (speeds up JOINs)
create index if not exists product_prices_product_id_idx on public.product_prices (product_id);
create index if not exists product_prices_store_id_idx on public.product_prices (store_id);

commit;
