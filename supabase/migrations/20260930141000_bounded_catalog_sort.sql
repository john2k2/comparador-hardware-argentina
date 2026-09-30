-- No materializar nombres/documentos/ofertas completos para contar, ni numerar
-- todo el catálogo antes de LIMIT. La segunda ordenación usa top-N por página.
begin;
create or replace function public.search_catalog_page(
  p_query text default '',p_category text default null,p_stores text[] default '{}',
  p_min_price numeric default null,p_max_price numeric default null,
  p_sort text default 'relevance',p_page integer default 1,p_page_size integer default 12
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public set jit=off as $$
declare normalized_query text := public.catalog_search_text(p_query); candidate text; result jsonb;
begin
  if p_page is null or p_page<1 or p_page_size is null or p_page_size not between 1 and 48
    or p_sort is null or p_sort not in ('relevance','price-asc','price-desc','name','newest')
    or length(coalesce(p_query,''))>240 or cardinality(p_stores)>80
    or p_min_price<0 or p_max_price<0 then raise exception 'Invalid catalog page parameters'; end if;
  select word into candidate from unnest(string_to_array(normalized_query,' ')) word
    where length(word)>1 order by (word~'[0-9]') desc,length(word) desc,word limit 1;

  execute $catalog$
  with candidates as (
    select p.id,
      case when $6='newest' or $6='relevance' then p.updated_at end as updated_at,
      case when $6='relevance' and $9<>'' then p.last_scraped_at end as last_scraped_at,
      case when $6='name' or ($6='relevance' and $9<>'') then p.catalog_name end as catalog_name,
      stats.lowest,stats.highest,stats.average,stats.available,stats.offer_ids,
      row_number() over(partition by p.category,p.catalog_identity
        order by (p.id like 'agrupado-%') desc,p.last_scraped_at desc nulls last,p.updated_at desc,p.id) as identity_rank
    from public.products p join public.catalog_price_summaries summary on summary.product_id=p.id
    cross join lateral (
      select summary.lowest,summary.highest,summary.average,summary.available,summary.urls,summary.offer_ids
        where coalesce(cardinality($3),0)=0
      union all
      select filtered.* from public.catalog_price_stats((
        select coalesce(jsonb_agg(offer),'[]') from jsonb_array_elements(summary.best_offers) offer
        where offer->>'store_id'=any($3)
      )) filtered where coalesce(cardinality($3),0)>0
    ) stats
    where ($2 is null or p.category=$2) and p.catalog_component
      and ($10 is null or p.catalog_document like '%'||$10||'%')
      and (coalesce(cardinality($3),0)=0 or summary.store_ids && $3)
      and ($9='' or public.catalog_matches_query(p.name,p.catalog_document,$1,stats.urls))
  ), eligible as materialized (
    select id,updated_at,last_scraped_at,catalog_name,lowest,highest,average,available,offer_ids
    from candidates where identity_rank=1
      and ($4 is null or lowest>=$4) and ($5 is null or lowest<=$5)
  ), scored as (
    select e.*,case when $9='' or $6<>'relevance' then 0 else
      25*(select count(*) from unnest(string_to_array($9,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')>0)
      + case when not exists(select 1 from unnest(string_to_array($9,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')=0) then 120 else 0 end
      + case when position(' '||$9||' ' in ' '||e.catalog_name||' ')>0 then 120 else 0 end
      + greatest(0,20-floor(e.lowest/200000))+least(15,greatest(0,e.available-1)*5)
      + case when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '4 hours' then 18
        when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '24 hours' then 12
        when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '72 hours' then 5
        when coalesce(e.last_scraped_at,e.updated_at)>=now()-interval '7 days' then -4 else -12 end end as score
    from eligible e
  ), totals as (
    select count(*) as total,ceil(count(*)::numeric/$8)::int as pages from eligible
  ), bounds as (
    select *,greatest(1,least($7,greatest(pages,1))) as page from totals
  ), page_items as materialized (
    select * from scored order by
      case when $6='price-asc' then lowest end asc,
      case when $6='price-desc' then lowest end desc,
      case when $6='name' then catalog_name end asc,
      case when $6='newest' or ($6='relevance' and $9='') then updated_at end desc,
      case when $6='relevance' and $9<>'' then (available>0)::int end desc,
      case when $6='relevance' then score end desc,
      case when $6='relevance' then lowest end asc,id asc
    limit $8 offset (select (page::bigint-1)*$8 from bounds)
  ), page_rows as (
    select *,row_number() over(order by
      case when $6='price-asc' then lowest end asc,
      case when $6='price-desc' then lowest end desc,
      case when $6='name' then catalog_name end asc,
      case when $6='newest' or ($6='relevance' and $9='') then updated_at end desc,
      case when $6='relevance' and $9<>'' then (available>0)::int end desc,
      case when $6='relevance' then score end desc,
      case when $6='relevance' then lowest end asc,id asc) as position from page_items
  )
  select jsonb_build_object('total',b.total,'totalPages',b.pages,'page',b.page,'pageSize',$8,
    'products',coalesce((select jsonb_agg(
      (to_jsonb(p)-'catalog_name'-'catalog_document'-'catalog_identity'-'catalog_component')||jsonb_build_object(
        'lowest_price',r.lowest,'highest_price',r.highest,'average_price',r.average,
        'product_prices',(select jsonb_agg(to_jsonb(o) order by o.price,o.store_id,o.url)
          from public.product_prices o where o.id=any(r.offer_ids))
      ) order by r.position) from page_rows r join public.products p on p.id=r.id),'[]'::jsonb))
  from bounds b
  $catalog$ into result using p_query,p_category,p_stores,p_min_price,p_max_price,p_sort,p_page,p_page_size,normalized_query,candidate;
  return result;
end $$;
commit;
