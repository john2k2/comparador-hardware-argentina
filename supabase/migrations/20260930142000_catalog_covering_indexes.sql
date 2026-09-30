-- El listado global debe contar identidades y ordenar precios sin leer las
-- descripciones, JSON de especificaciones o publicaciones completas de cada fila.
begin;
set local lock_timeout='5s';
create index products_catalog_lookup_idx on public.products(id)
  include(category,catalog_identity,last_scraped_at,updated_at) where catalog_component;
create index catalog_price_summaries_lookup_idx on public.catalog_price_summaries(product_id)
  include(lowest,highest,average,available,offer_ids);
analyze public.products;
analyze public.catalog_price_summaries;
commit;
