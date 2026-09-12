begin;

-- El sitemap sólo necesita productos con dos comercios disponibles. Resolver
-- ese conjunto en PostgreSQL evita cargar el catálogo completo en el Worker.
create index if not exists product_prices_sitemap_eligible_idx
  on public.product_prices (product_id, store_id)
  where price > 0
    and url is not null
    and stock <> 'out-of-stock';

create or replace function public.count_indexable_sitemap_products()
returns bigint
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with eligible_products as (
    select product.id, product.updated_at, product.canonical_product_key
    from public.products product
    join public.product_prices price
      on price.product_id = product.id
     and price.price > 0
     and price.url is not null
     and price.stock <> 'out-of-stock'
    where product.id like 'agrupado-%'
    group by product.id, product.updated_at, product.canonical_product_key
    having count(distinct price.store_id) >= 2
  ), ranked_products as (
    select row_number() over (
      partition by coalesce(nullif(canonical_product_key, ''), id)
      order by updated_at desc, id asc
    ) as dedupe_rank
    from eligible_products
  )
  select count(*)::bigint
  from ranked_products
  where dedupe_rank = 1;
$function$;

create or replace function public.read_indexable_sitemap_products(
  p_page integer,
  p_page_size integer
)
returns table (
  id text,
  updated_at timestamptz,
  canonical_product_key text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with eligible_products as (
    select product.id, product.updated_at, product.canonical_product_key
    from public.products product
    join public.product_prices price
      on price.product_id = product.id
     and price.price > 0
     and price.url is not null
     and price.stock <> 'out-of-stock'
    where product.id like 'agrupado-%'
    group by product.id, product.updated_at, product.canonical_product_key
    having count(distinct price.store_id) >= 2
  ), ranked_products as (
    select
      id,
      updated_at,
      canonical_product_key,
      row_number() over (
        partition by coalesce(nullif(canonical_product_key, ''), id)
        order by updated_at desc, id asc
      ) as dedupe_rank
    from eligible_products
  )
  select id, updated_at, canonical_product_key
  from ranked_products
  where dedupe_rank = 1
  order by updated_at desc, id asc
  limit greatest(1, least(p_page_size, 1000))
  offset greatest(0, p_page) * greatest(1, least(p_page_size, 1000));
$function$;

revoke all on function public.count_indexable_sitemap_products() from public;
revoke all on function public.read_indexable_sitemap_products(integer, integer) from public;
grant execute on function public.count_indexable_sitemap_products() to anon, authenticated, service_role;
grant execute on function public.read_indexable_sitemap_products(integer, integer) to anon, authenticated, service_role;

comment on function public.count_indexable_sitemap_products()
is 'Cuenta productos agrupados con al menos dos comercios disponibles, deduplicados por clave canónica.';

comment on function public.read_indexable_sitemap_products(integer, integer)
is 'Devuelve una página estable de productos indexables para el sitemap público.';

commit;
