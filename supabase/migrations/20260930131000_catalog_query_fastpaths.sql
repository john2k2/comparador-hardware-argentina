-- La primera medición del catálogo completo encontró trabajo redundante en SQL.
-- Materializar sólo claves/precios y cargar el JSON de ofertas únicamente al final.
begin;
alter table public.products add column catalog_identity text generated always as (public.catalog_identity_text(name)) stored;
alter table public.products add column catalog_component boolean generated always as (public.catalog_standalone(name,category)) stored;

create or replace function public.search_catalog_page(
  p_query text default '', p_category text default null, p_stores text[] default '{}',
  p_min_price numeric default null, p_max_price numeric default null,
  p_sort text default 'relevance', p_page integer default 1, p_page_size integer default 12
) returns jsonb language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare normalized_query text := public.catalog_search_text(p_query); candidate text; result jsonb;
begin
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 48
    or p_sort is null or p_sort not in ('relevance','price-asc','price-desc','name','newest')
    or length(coalesce(p_query,'')) > 240 or cardinality(p_stores) > 80
    or p_min_price < 0 or p_max_price < 0 then raise exception 'Invalid catalog page parameters'; end if;
  select word into candidate from unnest(string_to_array(normalized_query,' ')) word
    where length(word)>1 order by (word ~ '[0-9]') desc,length(word) desc,word limit 1;

  with candidates as materialized (
    select p.id,p.name,p.category,p.updated_at,p.last_scraped_at,p.catalog_name,p.catalog_document,
      p.catalog_identity as identity_name
    from public.products p
    where (p_category is null or p.category=p_category)
      and (candidate is null or p.catalog_document like '%' || candidate || '%')
      and p.catalog_component
  ), selected_offers as materialized (
    select distinct on (pp.product_id,lower(pp.store_id)) pp.id,pp.product_id,pp.store_id,pp.url,pp.price,pp.stock
    from public.product_prices pp join candidates c on c.id=pp.product_id
    where pp.price>0 and pp.price::text not in ('NaN','Infinity','-Infinity')
      and (coalesce(cardinality(p_stores),0)=0 or lower(pp.store_id)=any(p_stores))
    order by pp.product_id,lower(pp.store_id),(pp.stock='out-of-stock'),
      (pp.identity_review is not null and (pp.identity_review->>'status' is distinct from 'consistent'
        or pp.identity_review#>>'{subject,url}' is distinct from pp.url)),pp.price,pp.last_updated desc,pp.url
  ), offer_counts as (
    select product_id,count(*) filter(where stock<>'out-of-stock') as available,
      array_agg(id) filter(where stock='out-of-stock') as unavailable_ids,
      string_agg(url,' ') as urls from selected_offers group by product_id
  ), price_basis as (
    select o.id,o.product_id,o.price from selected_offers o join offer_counts n using(product_id)
    where n.available=0 or o.stock<>'out-of-stock'
  ), medians as (
    select product_id,count(*) as n,min(price) as minimum,max(price) as maximum,
      percentile_cont(0.5) within group(order by price)::numeric as median
    from price_basis group by product_id
  ), checked_prices as (
    select b.*, case
      when m.n<=1 then true
      when m.n=2 then not (m.maximum/m.minimum>=4 and m.maximum-m.minimum>=150000 and b.price=m.maximum)
      else not ((b.price/m.median>=2.6 or b.price/m.median<=0.38)
        and abs(b.price-m.median)>=greatest(50000,round(m.median*0.35))) end as comparable
    from price_basis b join medians m using(product_id)
  ), accepted as (
    select * from (select cp.*,bool_or(comparable) over(partition by product_id) as any_comparable from checked_prices cp) checked
    where comparable or not any_comparable
  ), stats as (
    select product_id,min(price) as lowest,max(price) as highest,round(avg(price)) as average,array_agg(id) as offer_ids
    from accepted group by product_id
  ), representatives as (
    select c.*,s.lowest,s.highest,s.average,n.available,
      s.offer_ids || case when n.available>0 then coalesce(n.unavailable_ids,'{}'::uuid[]) else '{}'::uuid[] end as offer_ids,
      row_number() over(partition by c.category,c.identity_name
        order by (c.id like 'agrupado-%') desc,c.last_scraped_at desc nulls last,c.updated_at desc,c.id) as identity_rank
    from candidates c join stats s on s.product_id=c.id join offer_counts n on n.product_id=c.id
    where normalized_query='' or public.catalog_matches_query(c.name,c.catalog_document,p_query,n.urls)
  ), eligible as materialized (
    select * from representatives where identity_rank=1
      and (p_min_price is null or lowest>=p_min_price) and (p_max_price is null or lowest<=p_max_price)
  ), scored as (
    select e.*, case when normalized_query='' then 0 else
      25*(select count(*) from unnest(string_to_array(normalized_query,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')>0)
      + case when not exists(select 1 from unnest(string_to_array(normalized_query,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')=0) then 120 else 0 end
      + case when position(' '||normalized_query||' ' in ' '||e.catalog_name||' ')>0 then 120 else 0 end
      + greatest(0,20-floor(e.lowest/200000)) + least(15,greatest(0,e.available-1)*5)
      + case when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '4 hours' then 18
        when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '24 hours' then 12
        when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '72 hours' then 5
        when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '7 days' then -4 else -12 end end as score
    from eligible e
  ), numbered as (
    select *,row_number() over(order by
      case when p_sort='price-asc' then lowest end asc,
      case when p_sort='price-desc' then lowest end desc,
      case when p_sort='name' then catalog_name end asc,
      case when p_sort='newest' or (p_sort='relevance' and normalized_query='') then updated_at end desc,
      case when p_sort='relevance' and normalized_query<>'' then (available>0)::int end desc,
      case when p_sort='relevance' then score end desc,
      case when p_sort='relevance' then lowest end asc,id asc) as position
    from scored
  ), totals as (
    select count(*) as total,ceil(count(*)::numeric/p_page_size)::int as pages from eligible
  ), bounds as (
    select *,greatest(1,least(p_page,greatest(pages,1))) as page from totals
  ), page_rows as (
    select n.* from numbered n cross join bounds b
    where n.position>(b.page::bigint-1)*p_page_size and n.position<=b.page::bigint*p_page_size
  )
  select jsonb_build_object('total',b.total,'totalPages',b.pages,'page',b.page,'pageSize',p_page_size,
    'products',coalesce((select jsonb_agg(
      (to_jsonb(p)-'catalog_name'-'catalog_document'-'catalog_identity'-'catalog_component') || jsonb_build_object(
        'lowest_price',r.lowest,'highest_price',r.highest,'average_price',r.average,
        'product_prices',(select jsonb_agg(to_jsonb(o) order by o.price,o.store_id,o.url)
          from public.product_prices o where o.id=any(r.offer_ids))
      ) order by r.position) from page_rows r join public.products p on p.id=r.id),'[]'::jsonb))
  into result from bounds b;
  return result;
end $$;

commit;
