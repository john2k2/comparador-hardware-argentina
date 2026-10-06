-- Filtrar resúmenes válidos antes de cargar productos y resolver identidad.
-- Vencidos se recalculan y la preferencia canónica permanece global.
begin;
set local lock_timeout='2s';
create or replace function public.search_catalog_page(
  p_query text default '',p_category text default null,p_stores text[] default '{}',
  p_min_price numeric default null,p_max_price numeric default null,
  p_sort text default 'relevance',p_page integer default 1,p_page_size integer default 12
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public set jit=off set statement_timeout='8s' as $$
declare normalized_query text := public.catalog_search_text(p_query); candidate text; result jsonb; words text[]; query_chip text[]; kind text := 'gpu'; candidate_sql text;
begin
  if p_page is null or p_page<1 or p_page_size is null or p_page_size not between 1 and 48
    or p_sort is null or p_sort not in ('relevance','price-asc','price-desc','name','newest')
    or length(coalesce(p_query,''))>240 or cardinality(p_stores)>80
    or p_min_price<0 or p_max_price<0 then raise exception 'Invalid catalog page parameters'; end if;
  select word into candidate from unnest(string_to_array(normalized_query,' ')) word
    where length(word)>1 order by (word~'[0-9]') desc,length(word) desc,word limit 1;

  words := array(select word from unnest(string_to_array(normalized_query,' ')) word where length(word)>1);
  query_chip := public.catalog_chip(p_query,'gpu');
  if query_chip is null then kind := 'cpu'; query_chip := public.catalog_chip(p_query,'cpu'); end if;

  -- El piso (incluido cero) solicita sólo ofertas comparables actuales.
  -- El resto conserva el contrato histórico y las reglas de texto/tienda.
  if normalized_query='' and coalesce(cardinality(p_stores),0)=0
    and (p_min_price is not null or p_max_price is not null) then
    candidate_sql := $current_catalog$
  with recent_summaries as materialized (
    select product_id from public.catalog_price_summaries
    where comparable_latest_observed_at >= now() - interval '24 hours'
      and comparable_stats is not null and now()<comparable_valid_until
      and ($4 is null or (comparable_stats->>'lowest')::numeric>=$4)
      and ($5 is null or (comparable_stats->>'lowest')::numeric<=$5)
    union all
    select product_id from public.catalog_price_summaries
    where comparable_latest_observed_at >= now() - interval '24 hours'
      and (comparable_stats is null or now()>=comparable_valid_until)
  ), candidates as (
    select p.id,
      case when $6 in ('newest','relevance') then p.updated_at end as updated_at,
      null::timestamptz as last_scraped_at,
      case when $6='name' then p.catalog_name end as catalog_name,
      current.lowest,current.highest,current.average,current.available,current.offer_ids,
      current.available as comparable_available,current.observed_at,1 as identity_rank
    from recent_summaries recent
    join public.catalog_price_summaries summary on summary.product_id=recent.product_id
    join public.products p on p.id=recent.product_id
    cross join lateral (
      select (summary.comparable_stats->>'lowest')::numeric as lowest,
        (summary.comparable_stats->>'highest')::numeric as highest,
        (summary.comparable_stats->>'average')::numeric as average,
        (summary.comparable_stats->>'available')::bigint as available,
        summary.comparable_stats->>'urls' as urls,
        array(select value::uuid from jsonb_array_elements_text(summary.comparable_stats->'offer_ids')) as offer_ids,
        (summary.comparable_stats->>'observed_at')::timestamptz as observed_at
      where summary.comparable_stats is not null and now()<summary.comparable_valid_until
      union all
      select recalculated.*,null::timestamptz as observed_at
      from public.catalog_current_price_stats(summary.comparable_offers,'{}') recalculated
      where summary.comparable_stats is null or now()>=summary.comparable_valid_until
    ) current
    where ($2 is null or p.category=$2) and p.catalog_component
      -- Elegir la misma identidad ANTES del rango/frescura: una publicación
      -- inferior no reemplaza silenciosamente a la ficha canónica vencida.
      and p.id=(
        select preferred.id from public.products preferred
        where preferred.catalog_component and preferred.category=p.category
          and preferred.catalog_identity=p.catalog_identity
          and exists(select 1 from public.catalog_price_summaries s where s.product_id=preferred.id)
        order by (preferred.id like 'agrupado-%') desc,
          preferred.last_scraped_at desc nulls last,preferred.updated_at desc,preferred.id
        limit 1
      )
  )
    $current_catalog$;
  else
    candidate_sql := $reference_catalog$
  with candidates as (
    select p.id,
      case when $6='newest' or $6='relevance' then p.updated_at end as updated_at,
      case when $6='relevance' and $9<>'' then p.last_scraped_at end as last_scraped_at,
      case when $6='name' or ($6='relevance' and $9<>'') then p.catalog_name end as catalog_name,
      stats.lowest,stats.highest,stats.average,stats.available,stats.offer_ids,coalesce(current.available,0) as comparable_available,current.observed_at,
      row_number() over(partition by p.category,p.catalog_identity
        order by (p.id like 'agrupado-%') desc,p.last_scraped_at desc nulls last,p.updated_at desc,p.id) as identity_rank
    from public.products p join public.catalog_price_summaries summary on summary.product_id=p.id
    left join lateral (
      select (summary.comparable_stats->>'lowest')::numeric as lowest,(summary.comparable_stats->>'highest')::numeric as highest,
        (summary.comparable_stats->>'average')::numeric as average,(summary.comparable_stats->>'available')::bigint as available,
        summary.comparable_stats->>'urls' as urls,array(select value::uuid from jsonb_array_elements_text(summary.comparable_stats->'offer_ids')) as offer_ids,
        (summary.comparable_stats->>'observed_at')::timestamptz as observed_at
      where coalesce(cardinality($3),0)=0 and summary.comparable_stats is not null and now()<summary.comparable_valid_until
      union all
      select recalculated.*,(select max((offer->>'last_updated')::timestamptz) from jsonb_array_elements(summary.comparable_offers) offer
         where $6='relevance' and $9<>'' and (offer->>'id')::uuid=any(recalculated.offer_ids)) as observed_at
      from public.catalog_current_price_stats(summary.comparable_offers,$3) recalculated
      where summary.comparable_latest_observed_at>=now()-interval '24 hours'
        and (coalesce(cardinality($3),0)>0 or summary.comparable_stats is null or now()>=summary.comparable_valid_until)
    ) current on true
    cross join lateral (
      select current.lowest,current.highest,current.average,current.available,current.urls,current.offer_ids,
        public.catalog_identity_text(current.urls) ~ '\m(sodimm|so\s*dimm|notebook|laptop)\M' as portable_listing
        where current.lowest is not null
      union all
      select summary.lowest,summary.highest,summary.average,summary.available,summary.urls,summary.offer_ids,summary.portable_listing
        where current.lowest is null and coalesce(cardinality($3),0)=0
      union all
      select filtered.*,public.catalog_identity_text(filtered.urls) ~ '\m(sodimm|so\s*dimm|notebook|laptop)\M'
        from public.catalog_price_stats((select coalesce(jsonb_agg(offer),'[]') from jsonb_array_elements(summary.best_offers) offer where offer->>'store_id'=any($3))) filtered
        where current.lowest is null and coalesce(cardinality($3),0)>0
    ) stats
    where ($2 is null or p.category=$2) and p.catalog_component
      and ($10 is null or p.catalog_document like '%'||$10||'%')
      and (coalesce(cardinality($3),0)=0 or summary.store_ids && $3)
      and ($9='' or public.catalog_matches_prepared(p.name,p.catalog_name,p.catalog_document,$9,$11,$12,$13,stats.urls,stats.portable_listing))
  )
    $reference_catalog$;
  end if;

  execute candidate_sql || $catalog$
, eligible as materialized (
    select id,updated_at,last_scraped_at,catalog_name,lowest,highest,average,available,offer_ids,comparable_available,observed_at
    from candidates where identity_rank=1
      and (($4 is null and $5 is null) or comparable_available>0)
      and ($4 is null or lowest>=$4) and ($5 is null or lowest<=$5)
  ), scored as (
    select e.*,case when $9='' or $6<>'relevance' then 0 else
      25*(select count(*) from unnest(string_to_array($9,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')>0)
      + case when not exists(select 1 from unnest(string_to_array($9,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')=0) then 120 else 0 end
      + case when position(' '||$9||' ' in ' '||e.catalog_name||' ')>0 then 120 else 0 end
      + greatest(0,20-floor(e.lowest/200000))+least(15,greatest(0,e.comparable_available-1)*5)
      + case when e.observed_at>=now()-interval '4 hours' then 18
        when e.observed_at>=now()-interval '24 hours' then 12 else -12 end end as score
    from eligible e
  ), totals as (
    select count(*) as total,ceil(count(*)::numeric/$8)::int as pages from eligible
  ), bounds as (
    select *,greatest(1,least($7,greatest(pages,1))) as page from totals
  ), page_items as materialized (
    select * from scored order by
      case when $6 in ('price-asc','price-desc') then (comparable_available>0)::int end desc,
      case when $6='price-asc' then lowest end asc,
      case when $6='price-desc' then lowest end desc,
      case when $6='name' then catalog_name end asc,
      case when $6='newest' or ($6='relevance' and $9='') then updated_at end desc,
      case when $6='relevance' then
        case when comparable_available=0 then 0
          when observed_at between now()-interval '24 hours' and now()+interval '1 minute' then 2 else 1 end
        end desc,
      case when $6='relevance' then score end desc,
      case when $6='relevance' then lowest end asc,id asc
    limit $8 offset (select (page::bigint-1)*$8 from bounds)
  ), page_rows as (
    select *,row_number() over(order by
      case when $6 in ('price-asc','price-desc') then (comparable_available>0)::int end desc,
      case when $6='price-asc' then lowest end asc,
      case when $6='price-desc' then lowest end desc,
      case when $6='name' then catalog_name end asc,
      case when $6='newest' or ($6='relevance' and $9='') then updated_at end desc,
      case when $6='relevance' then
        case when comparable_available=0 then 0
          when observed_at between now()-interval '24 hours' and now()+interval '1 minute' then 2 else 1 end
        end desc,
      case when $6='relevance' then score end desc,
      case when $6='relevance' then lowest end asc,id asc) as position from page_items
  )
  select jsonb_build_object('total',b.total,'totalPages',b.pages,'page',b.page,'pageSize',$8,
    'products',coalesce((select jsonb_agg(
      (to_jsonb(p)-'catalog_name'-'catalog_document'-'catalog_identity'-'catalog_component')||jsonb_build_object(
        'lowest_price',r.lowest,'highest_price',r.highest,'average_price',r.average,
        'product_prices',(select jsonb_agg(to_jsonb(o) order by o.price,o.store_id,o.url)
          from public.product_prices o where o.product_id=r.id and (coalesce(cardinality($3),0)=0 or lower(o.store_id)=any($3)))
      ) order by r.position) from page_rows r join public.products p on p.id=r.id),'[]'::jsonb))
  from bounds b
  $catalog$ into result using p_query,p_category,p_stores,p_min_price,p_max_price,p_sort,p_page,p_page_size,normalized_query,candidate,words,query_chip,kind;
  return result;
end $$;

commit;
