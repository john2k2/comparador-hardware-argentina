-- Un solo universo persistido para SSR/API. No hay límite previo de candidatos
-- ni agrupación aproximada en el Worker. Las ofertas conservan su product_id.
begin;

create or replace function public.catalog_identity_text(value text)
returns text language sql immutable parallel safe set search_path = pg_catalog, public as $$
  select trim(regexp_replace(regexp_replace(lower(regexp_replace(
    normalize(coalesce(value, ''), NFD), U&'[\0300-\036f]', '', 'g')),
    '[^a-z0-9+[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.catalog_search_text(value text)
returns text language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare result text := public.catalog_identity_text(value);
begin
  result := regexp_replace(result, '\m(placas?\s+de\s+video|tarjetas?\s+graficas?|gpu)\M', 'gpu', 'g');
  result := regexp_replace(result, '\m(procesadores?|microprocesadores?|micro|cpu)\M', 'cpu', 'g');
  result := regexp_replace(result, '\m(memoria\s+ram|ram)\M', 'ram', 'g');
  result := regexp_replace(result, '\m(disco\s+solido|solid\s+state|ssd)\M', 'ssd', 'g');
  result := regexp_replace(result, '\m(fuentes?\s+de\s+alimentacion|psu)\M', 'psu', 'g');
  result := regexp_replace(result, '\m(placas?\s+madre|motherboards?|mother)\M', 'motherboard', 'g');
  return result;
end $$;

-- Familia, número y sufijos. Misma precedencia que product-identity.ts: evita
-- que una mención comercial a otro SKU habilite un resultado incorrecto.
create or replace function public.catalog_chip(value text, kind text)
returns text[] language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare title text := public.catalog_identity_text(value); part text[];
begin
  if kind = 'gpu' then
    part := regexp_match(title, '\m(?:geforce\s+)?(rtx|gtx)\s*(\d{3,4})(?:\s*(ti))?(?:\s*(super)|\s+s(?=\s|$))?\M');
    if part is not null then
      return array[part[1], part[2], trim(coalesce(part[3], '') || ' ' ||
        case when part[4] = 'super' or (part[3] = 'ti' and title ~ '\m(rtx|gtx)\s*\d{3,4}\s*ti\s+s(\s|$)') then 'super' else '' end)];
    end if;
    part := regexp_match(title, '\m(?:radeon\s+)?rx\s*(\d{3,4})(?:\s*(xtx|xt))?\M');
    if part is not null then return array['rx', part[1], coalesce(part[2], '')]; end if;
    part := regexp_match(title, '\marc\s*([a-z]?\d{3})\M');
    if part is not null then return array['arc', part[1], '']; end if;
  else
    part := regexp_match(title, '\mryzen\s*(?:([3579])\s+)?(\d{3,5})(x3d|gt|ge|xt|x|g|f|t)?\M');
    if part is not null then return array['ryzen' || coalesce(part[1], ''), part[2], coalesce(part[3], '')]; end if;
    part := regexp_match(title, '\mcore\s*i([3579])\s*(\d{4,5})([a-z]{0,2})\M');
    if part is not null then return array['corei' || part[1], part[2], coalesce(part[3], '')]; end if;
    part := regexp_match(title, '\m(\d{3,5})(x3d|gt|ge|xt|x|g|f|t)\M');
    if part is not null then return array['unknown', part[1], part[2]]; end if;
    if title ~ '\m(ryzen|core|procesador|micro)\M' or title ~ '^\d{3,5}$' then
      part := regexp_match(title, '\m(\d{3,5})\M');
      if part is not null then return array['unknown', part[1], '']; end if;
    end if;
  end if;
  return null;
end $$;

create or replace function public.catalog_matches_query(title text, document text, query text, urls text)
returns boolean language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare
  normalized text := public.catalog_search_text(query);
  name text := public.catalog_search_text(title);
  words text[] := array(select word from unnest(string_to_array(normalized, ' ')) word where length(word) > 1);
  token text; matched integer := 0; query_chip text[]; product_chip text[]; kind text;
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
  if public.catalog_search_text(title || ' ' || coalesce(urls, '')) ~ '\m(sodimm|so\s*dimm|notebook|laptop)\M'
    and normalized !~ '\m(sodimm|so\s*dimm|notebook|laptop)\M'
    and (normalized || ' ' || name || ' ' || public.catalog_search_text(urls)) ~ '\m(ddr[45]|ram|memoria|sodimm|dimm)\M'
    then return false; end if;
  kind := 'gpu'; query_chip := public.catalog_chip(query, kind);
  if query_chip is null then kind := 'cpu'; query_chip := public.catalog_chip(query, kind); end if;
  if query_chip is not null then
    product_chip := public.catalog_chip(title, kind);
    if product_chip is null or query_chip[2] <> product_chip[2] then return false; end if;
    if query_chip[1] <> 'unknown' and product_chip[1] <> 'unknown'
      and regexp_replace(query_chip[1], '[3579]$', '') <> regexp_replace(product_chip[1], '[3579]$', '') then return false; end if;
    if query_chip[3] <> '' and query_chip[3] <> product_chip[3] then return false; end if;
  end if;
  return true;
end $$;

create or replace function public.catalog_standalone(title text, category text)
returns boolean language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare name text := public.catalog_identity_text(title); families integer; hints integer;
begin
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

-- Normalización almacenada: el coste de texto se paga al cambiar una ficha,
-- no miles de veces en cada petición. Las claves RAM/GPU antiguas no agrupan.
alter table public.products add column catalog_name text generated always as (public.catalog_search_text(name)) stored;
alter table public.products add column catalog_document text generated always as (
  public.catalog_search_text(name || ' ' || coalesce(brand,'') || ' ' || coalesce(model,'') || ' ' || coalesce(normalized_title,'') || ' ' || coalesce(family_key,'') || ' ' || coalesce(variant_key,'') || ' ' || coalesce(canonical_product_key,''))
) stored;
create index products_catalog_document_trgm_idx on public.products using gin (catalog_document gin_trgm_ops);

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
      public.catalog_identity_text(p.name) as identity_name
    from public.products p
    where (p_category is null or p.category=p_category)
      and (candidate is null or p.catalog_document like '%' || candidate || '%')
      and public.catalog_standalone(p.name,p.category)
  ), selected_offers as materialized (
    select distinct on (pp.product_id,lower(pp.store_id)) pp.*
    from public.product_prices pp join candidates c on c.id=pp.product_id
    where pp.price>0 and pp.price::text not in ('NaN','Infinity','-Infinity')
      and (coalesce(cardinality(p_stores),0)=0 or lower(pp.store_id)=any(p_stores))
    order by pp.product_id,lower(pp.store_id),(pp.stock='out-of-stock'),
      (pp.identity_review is not null and (pp.identity_review->>'status' is distinct from 'consistent'
        or pp.identity_review#>>'{subject,url}' is distinct from pp.url)),pp.price,pp.last_updated desc,pp.url
  ), offer_counts as (
    select product_id,count(*) filter(where stock<>'out-of-stock') as available,
      string_agg(url,' ') as urls from selected_offers group by product_id
  ), price_basis as (
    select o.* from selected_offers o join offer_counts n using(product_id)
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
  ), accepted as materialized (
    select cp.* from checked_prices cp where comparable
      or not exists(select 1 from checked_prices sibling where sibling.product_id=cp.product_id and sibling.comparable)
  ), stats as (
    select product_id,min(price) as lowest,max(price) as highest,round(avg(price)) as average
    from accepted group by product_id
  ), representatives as (
    select c.*,s.lowest,s.highest,s.average,n.available,
      row_number() over(partition by c.category,c.identity_name
        order by (c.id like 'agrupado-%') desc,c.last_scraped_at desc nulls last,c.updated_at desc,c.id) as identity_rank
    from candidates c join stats s on s.product_id=c.id join offer_counts n on n.product_id=c.id
    where public.catalog_matches_query(c.name,c.catalog_document,p_query,n.urls)
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
      (to_jsonb(p)-'catalog_name'-'catalog_document') || jsonb_build_object(
        'lowest_price',r.lowest,'highest_price',r.highest,'average_price',r.average,
        'product_prices',(select jsonb_agg(to_jsonb(o) order by o.price,o.store_id,o.url)
          from selected_offers o where o.product_id=r.id and (
            (o.stock='out-of-stock' and r.available>0)
            or exists(select 1 from accepted a where a.id=o.id)))
      ) order by r.position) from page_rows r join public.products p on p.id=r.id),'[]'::jsonb))
  into result from bounds b;
  return result;
end $$;

revoke all on function public.catalog_identity_text(text),public.catalog_search_text(text),public.catalog_chip(text,text),public.catalog_matches_query(text,text,text,text),public.catalog_standalone(text,text),public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer) from public;
grant execute on function public.catalog_identity_text(text),public.catalog_search_text(text),public.catalog_chip(text,text),public.catalog_matches_query(text,text,text,text),public.catalog_standalone(text,text),public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer) to anon,authenticated,service_role;

comment on function public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)
is 'Catálogo paginado completo: identidad de nombre exacta, ofertas del registro persistido, filtros antes de LIMIT y total del mismo snapshot. No ejecuta scraping.';
commit;
