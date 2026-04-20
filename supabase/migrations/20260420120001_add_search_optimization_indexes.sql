-- Migration: Add missing GIN trigram indexes for search optimization
-- Date: 2026-04-20
-- Issue: buildSearchOrFilter uses ILIKE on name, brand, model but only normalized_title has trigram index

begin;

-- Add trigram indexes for better search performance on products table
create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create index if not exists products_brand_trgm_idx on public.products using gin (brand gin_trgm_ops);
create index if not exists products_model_trgm_idx on public.products using gin (model gin_trgm_ops);
create index if not exists products_family_key_trgm_idx on public.products using gin (family_key gin_trgm_ops);
create index if not exists products_variant_key_trgm_idx on public.products using gin (variant_key gin_trgm_ops);

comment on index public.products_name_trgm_idx
is 'Trigram index for ILIKE searches on product name';

comment on index public.products_brand_trgm_idx
is 'Trigram index for ILIKE searches on product brand';

comment on index public.products_model_trgm_idx
is 'Trigram index for ILIKE searches on product model';

comment on index public.products_family_key_trgm_idx
is 'Trigram index for ILIKE searches on product family_key';

comment on index public.products_variant_key_trgm_idx
is 'Trigram index for ILIKE searches on product variant_key';

-- Also add composite index for common search patterns
create index if not exists products_category_updated_at_idx on public.products (category, updated_at desc);
create index if not exists products_normalized_title_category_idx on public.products (normalized_title varchar_pattern_ops, category);

commit;
