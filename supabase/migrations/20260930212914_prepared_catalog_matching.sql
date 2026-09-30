-- Preparar una vez la consulta; usar el nombre ya normalizado del catálogo.
-- Evitar que accesorios compatibles con CPU/GPU entren como componentes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.catalog_cooling_title(title text)
returns boolean language sql immutable parallel safe set search_path=pg_catalog,public as $$
 select public.catalog_identity_text(title) ~ '^(water\s*cooler|refrigeracion|ventilador|disipador)\M'
   or public.catalog_identity_text(title) ~ '^cooler\s+(?!master\M)'
   or public.catalog_identity_text(title) ~ '^cooler\s+master\s+(masterliquid|ml\d+[a-z0-9]*|hyper|liquid)\M';
$$;
create or replace function public.catalog_matches_prepared(title text, name text, document text, normalized text, words text[], query_chip text[], kind text, urls text)
returns boolean language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare
  token text; matched integer := 0; product_chip text[];
begin
  if normalized = '' then return true; end if;
  foreach token in array words loop
    if position(' ' || token || ' ' in ' ' || document || ' ') = 0 then return false; end if;
    if position(' ' || token || ' ' in ' ' || name || ' ') > 0 then matched := matched + 1; end if;
    if token = any(array['aorus','strix','tuf','dual','prime','proart','eagle','windforce','gaming','ventus','shadow','suprim','trinity','phoenix','pulse','nitro','challenger','hellhound','tomahawk','mortar','ds3h','hero','lightspeed'])
      and position(' ' || token || ' ' in ' ' || name || ' ') = 0 then return false; end if;
  end loop;
  if matched < (case when cardinality(words) <= 2 then cardinality(words) else ceil(cardinality(words) * 0.7)::int end) then return false; end if;
  foreach token in array string_to_array(normalized, ' ') loop
    if token = any(array['x','g','f','k']) and exists (
      select 1 from unnest(words) word where word ~ '^\d{3,5}$' or (word ~ '[a-z]' and word ~ '[0-9]')
    ) and not exists (
      select 1 from unnest(words) word
      where (word ~ '^\d{3,5}$' or (word ~ '[a-z]' and word ~ '[0-9]'))
        and (position(word || token in name) > 0 or position(' ' || word || ' ' || token || ' ' in ' ' || name || ' ') > 0)
    ) then return false; end if;
  end loop;
  if public.catalog_identity_text(title || ' ' || coalesce(urls, '')) ~ '\m(sodimm|so\s*dimm|notebook|laptop)\M'
    and normalized !~ '\m(sodimm|so\s*dimm|notebook|laptop)\M'
    and (normalized || ' ' || name || ' ' || public.catalog_search_text(urls)) ~ '\m(ddr[45]|ram|memoria|sodimm|dimm)\M'
    then return false; end if;
  if query_chip is not null then
    product_chip := public.catalog_chip(title, kind);
    if product_chip is null or query_chip[2] <> product_chip[2] then return false; end if;
    if query_chip[1] <> 'unknown' and product_chip[1] <> 'unknown'
      and regexp_replace(query_chip[1], '[3579]$', '') <> regexp_replace(product_chip[1], '[3579]$', '') then return false; end if;
    if query_chip[3] <> '' and query_chip[3] <> product_chip[3] then return false; end if;
  end if;
  return true;
end $$;

create or replace function public.catalog_matches_query(title text, document text, query text, urls text)
returns boolean language plpgsql immutable parallel safe set search_path=pg_catalog,public as $$
declare normalized text := public.catalog_search_text(query); words text[];
  query_chip text[] := public.catalog_chip(query,'gpu'); kind text := 'gpu';
begin
  words := array(select word from unnest(string_to_array(normalized,' ')) word where length(word)>1);
  if query_chip is null then kind := 'cpu'; query_chip := public.catalog_chip(query,kind); end if;
  return public.catalog_matches_prepared(title,public.catalog_search_text(title),document,normalized,words,query_chip,kind,urls);
end $$;
create or replace function public.catalog_standalone(title text, category text)
returns boolean language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare name text := public.catalog_identity_text(title); families integer; hints integer;
begin
  if category in ('procesadores','tarjetas-graficas','memoria-ram') and public.catalog_cooling_title(title) then return false; end if;
  if category not in ('procesadores','tarjetas-graficas','memoria-ram') then return true; end if;
  if name ~ '(pc gamer|combo|armado|armada|pc completa|pc creadores|computadora|desktop|workstation|notebook|laptop|all in one|netbook|chromebook|bundle|paquete)'
    or name ~ '\m(escritorio|build)\M' then return false; end if;
  families := (name ~ '\m(ryzen|core\s*i[3579]|procesador|cpu)\M')::int
    + (name ~ '\m(rtx|gtx|radeon|geforce|rx\s*\d{3,4}|gpu)\M')::int
    + (name ~ '\m(motherboard|mother|placa\s+madre)\M')::int
    + (name ~ '\m(ddr4|ddr5|ram|memoria)\M')::int
    + (name ~ '\m(ssd|nvme|hdd|disco)\M')::int;
  if (position('+' in name) > 0 or name ~ '\m(kit|bundle|paquete)\M') and families >= 2 then return false; end if;
  hints := (name ~ '\m\d{1,2}\s*gb\M')::int + (name ~ '\m(\d+\s*tb|\d{3,4}\s*gb)\M')::int
    + (name ~ '\m[abhx]\d{3}[a-z]?\M')::int + (name ~ '\m(arc|b580)\M')::int;
  return not (name ~ '\mpc\M' and name ~ '\m(ryzen|core\s*i[3579]|procesador|cpu|rtx|gtx|radeon|geforce|gpu)\M' and families + hints >= 2);
end $$;

-- Corregir categorías sin modificar IDs, ofertas ni historial de precios.
update public.products set category='refrigeracion'
where category not in ('refrigeracion','computadoras')
  and catalog_name ~ '^(water ?cooler|refrigeracion|ventilador|disipador|cooler)\M'
  and public.catalog_cooling_title(name);
create or replace function public.search_catalog_page(
  p_query text default '',p_category text default null,p_stores text[] default '{}',
  p_min_price numeric default null,p_max_price numeric default null,
  p_sort text default 'relevance',p_page integer default 1,p_page_size integer default 12
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public set jit=off as $$
declare normalized_query text := public.catalog_search_text(p_query); candidate text; result jsonb; words text[]; query_chip text[]; kind text := 'gpu';
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
      and ($9='' or public.catalog_matches_prepared(p.name,p.catalog_name,p.catalog_document,$9,$11,$12,$13,stats.urls))
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
  $catalog$ into result using p_query,p_category,p_stores,p_min_price,p_max_price,p_sort,p_page,p_page_size,normalized_query,candidate,words,query_chip,kind;
  return result;
end $$;
commit;
