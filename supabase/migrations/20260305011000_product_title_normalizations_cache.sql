create table if not exists public.product_title_normalizations (
  raw_title text primary key,
  normalized_title text not null,
  source text not null default 'gemini',
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_title_normalizations_updated_at
  on public.product_title_normalizations (updated_at desc);
