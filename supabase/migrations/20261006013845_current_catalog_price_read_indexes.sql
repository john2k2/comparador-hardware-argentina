-- Partir de observaciones actuales evita ordenar todo el histórico.
-- Los índices conservan precio/stock/identidad/fechas; no inicializan resúmenes.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create index catalog_price_summaries_observed_idx
  on public.catalog_price_summaries(comparable_latest_observed_at desc,product_id)
  where comparable_latest_observed_at is not null;
create index products_catalog_identity_preference_idx
  on public.products(category,catalog_identity,(id like 'agrupado-%') desc,
    last_scraped_at desc nulls last,updated_at desc,id)
  where catalog_component;

commit;
