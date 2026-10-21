-- Sólo lectura: verificar la RPC con datos reales y permisos públicos.
\set ON_ERROR_STOP on
begin read only;
set local role anon;
with result as (
  select public.search_catalog_page(p_query => 'ryzen 7600',
    p_category => 'procesadores', p_page_size => 12) as data
)
select json_build_object('check','anonymous_search','total',data->'total',
  'returned',jsonb_array_length(data->'products')) from result;
with result as (
  select public.search_catalog_page(p_query => '',
    p_category => 'procesadores', p_min_price => 0, p_sort => 'price-asc', p_page_size => 12) as data
)
select json_build_object('check','current_catalog','total',data->'total',
  'returned',jsonb_array_length(data->'products')) from result;
rollback;
