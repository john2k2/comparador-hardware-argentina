-- La preparación privada compara id/product_id/categoría de todas las ofertas.
-- Índices generales: el índice parcial de componentes no cubre mantenimiento.
-- Evitar leer descripciones, specs, URLs y el resto del heap para reconciliar.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create index products_catalog_seed_lookup_idx
  on public.products(id) include(category);
create index product_prices_catalog_seed_lookup_idx
  on public.product_prices(id) include(product_id);

comment on index public.products_catalog_seed_lookup_idx is
  'Lectura estrecha de categoría para preparar la cola privada, sin filtrar componentes.';
comment on index public.product_prices_catalog_seed_lookup_idx is
  'Lectura estrecha de identidad y producto para reconciliar todas las ofertas de la cola privada.';
commit;
