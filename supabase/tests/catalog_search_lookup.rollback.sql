-- Reversión guardada: restaura 3fec y elimina sólo la proyección derivada.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $guard$
declare routine record;
begin
  select * into routine from pg_proc where oid=to_regprocedure('public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)');
  if routine.oid is null or md5(routine.prosrc) is distinct from '03f6433c26a74575f1f224d23918d3d4'
    or routine.prosecdef is distinct from false or routine.provolatile is distinct from 's'
    or routine.proparallel is distinct from 'u' or routine.pronargdefaults is distinct from 8
    or routine.procost is distinct from 100::real
    or routine.proconfig is distinct from array['search_path=pg_catalog, public','jit=off','statement_timeout=8s']::text[] then
    raise exception 'search_catalog_page cambió: revisar antes de revertir proyección';
  end if;
end $guard$;

do $lookup_guard$
begin
  if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.sync_products_search_lookup()')) is distinct from '3b535ace856835d71fc4e1b1885923e0'
    or not exists(select 1 from pg_proc where oid=to_regprocedure('public.sync_products_search_lookup()') and prosecdef and proconfig=array['search_path=pg_catalog, public']::text[])
    or not exists(select 1 from pg_class where oid=to_regclass('public.products_search_lookup') and relrowsecurity and relkind='r')
    or (select array_agg(attname::text order by attnum) from pg_attribute where attrelid=to_regclass('public.products_search_lookup') and attnum>0) is distinct from array['id','category','catalog_identity','catalog_name','catalog_document']::text[]
    or (select count(*) from pg_index where indrelid=to_regclass('public.products_search_lookup'))<>2
    or (select count(*) from pg_constraint where conrelid=to_regclass('public.products_search_lookup'))<>2
    or (select count(*) from pg_policy where polrelid=to_regclass('public.products_search_lookup'))<>1
    or exists(select 1 from pg_trigger where tgrelid=to_regclass('public.products_search_lookup') and not tgisinternal)
    or (select count(*) from pg_trigger where tgrelid='public.products'::regclass
      and tgfoid=to_regprocedure('public.sync_products_search_lookup()') and not tgisinternal and tgenabled='O')<>3 then
    raise exception 'Proyección modificada: revisar antes de revertir';
  end if;
  if pg_get_indexdef(to_regclass('public.products_search_lookup_pkey')) is distinct from 'CREATE UNIQUE INDEX products_search_lookup_pkey ON public.products_search_lookup USING btree (id)'
    or pg_get_indexdef(to_regclass('public.products_search_lookup_document_idx')) is distinct from 'CREATE INDEX products_search_lookup_document_idx ON public.products_search_lookup USING gin (catalog_document gin_trgm_ops)' then
    raise exception 'Índice modificado: revisar antes de revertir';
  end if;
end $lookup_guard$;
create or replace function public.search_catalog_page(
  p_query text default '',p_category text default null,p_stores text[] default '{}',
  p_min_price numeric default null,p_max_price numeric default null,
  p_sort text default 'relevance',p_page integer default 1,p_page_size integer default 12
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public set jit=off set statement_timeout='8s' as $$
declare normalized_query text := public.catalog_search_text(p_query); candidate text; result jsonb; words text[]; query_chip text[]; kind text := 'gpu'; candidate_sql text; ram_query boolean;
begin
  if p_page is null or p_page<1 or p_page_size is null or p_page_size not between 1 and 48
    or p_sort is null or p_sort not in ('relevance','price-asc','price-desc','name','newest')
    or length(coalesce(p_query,''))>240 or cardinality(p_stores)>80
    or p_min_price<0 or p_max_price<0 then raise exception 'Invalid catalog page parameters'; end if;
  query_chip := public.catalog_chip(p_query,'gpu');
  if query_chip is null then kind := 'cpu'; query_chip := public.catalog_chip(p_query,'cpu'); end if;
  ram_query := p_category='memoria-ram' or (p_category is null and query_chip is null
    and normalized_query ~ '\m(ddr[345]|ram|memoria)\M');
  if ram_query then
    normalized_query := public.catalog_ram_search_text(normalized_query);
  end if;
  -- La columna almacenada conserva el formato anterior. El prefiltro indexado
  -- usa una parte estable de unidades/kits, luego el matcher exige firma exacta.
  select word into candidate from (
    select case when ram_query then
      case when token ~ '^[0-9]+(gb|mhz)$' then regexp_replace(token,'(gb|mhz)$','')
        when token ~ '^[1-8]x[0-9]+gb$' then substring(token from 'x([0-9]+)')
        else token end
      else token end as word from unnest(string_to_array(normalized_query,' ')) token
  ) stable_tokens
    where length(word)>1 order by (word~'[0-9]') desc,length(word) desc,word limit 1;

  words := array(select word from unnest(string_to_array(normalized_query,' ')) word where length(word)>1);
  if ram_query then
    kind := 'ram'; query_chip := null;
  end if;
  -- Un número solo no identifica una familia: 7600 puede ser Ryzen o Radeon.
  -- La categoría CPU explícita conserva su firma; el resto conserva el token
  -- obligatorio y los filtros sin imponerle un procesador a una placa de video.
  if normalized_query ~ '^[0-9]{3,5}$' and p_category is distinct from 'procesadores' then
    query_chip := null;
  end if;

  -- El piso (incluido cero) solicita sólo ofertas comparables actuales.
  -- El resto conserva el contrato histórico y las reglas de texto/tienda.
  if normalized_query='' and coalesce(cardinality(p_stores),0)=0
    and (p_min_price is not null or p_max_price is not null) then
    candidate_sql := $current_catalog$
  with recent_summaries as materialized (
    select product_id,comparable_stats,comparable_valid_until,null::jsonb as comparable_offers from public.catalog_price_summaries
    where comparable_latest_observed_at >= now() - interval '24 hours'
      and comparable_stats is not null and now()<comparable_valid_until
      and ($4 is null or (comparable_stats->>'lowest')::numeric>=$4)
      and ($5 is null or (comparable_stats->>'lowest')::numeric<=$5)
    union all
    select product_id,comparable_stats,comparable_valid_until,comparable_offers from public.catalog_price_summaries
    where comparable_latest_observed_at >= now() - interval '24 hours'
      and (comparable_stats is null or now()>=comparable_valid_until)
  ), candidates as (
    select p.id,
      case when $6 in ('newest','relevance') then p.updated_at end as updated_at,
      null::timestamptz as last_scraped_at,
      case when $6='name' then p.catalog_name end as catalog_name,
      current.lowest,current.highest,current.average,current.available,current.offer_ids,
      current.available as comparable_available,current.observed_at,1 as identity_rank
    from recent_summaries summary
    join public.products p on p.id=summary.product_id
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
  with matched_candidates as materialized (
    select p.id,
      case when $6='newest' or $6='relevance' then p.updated_at end as updated_at,
      case when $6='relevance' and $9<>'' then p.last_scraped_at end as last_scraped_at,
      case when $6='name' or ($6='relevance' and $9<>'') then p.catalog_name end as catalog_name,
      stats.lowest,stats.highest,stats.average,stats.available,stats.offer_ids,coalesce(current.available,0) as comparable_available,current.observed_at,
      p.category,p.catalog_identity,(p.id like 'agrupado-%') as grouped_identity,
      p.last_scraped_at as preference_scraped_at,p.updated_at as preference_updated_at
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
      and ($13='ram' or cardinality($11)>2 or not exists(
        select 1 from unnest($11) word
        where position(' '||word||' ' in ' '||p.catalog_name||' ')=0))
      and (coalesce(cardinality($3),0)=0 or summary.store_ids && $3)
      and ($9='' or public.catalog_matches_prepared(p.name,p.catalog_name,p.catalog_document,$9,$11,$12,$13,stats.urls,stats.portable_listing))
  ), candidates as (
    -- Materializar después de verificar texto y oferta evita ordenar los JSON
    -- completos de cada tienda. La preferencia de identidad conserva su orden.
    select m.*,row_number() over(partition by category,catalog_identity
      order by grouped_identity desc,preference_scraped_at desc nulls last,preference_updated_at desc,id) as identity_rank
    from matched_candidates m
  )
    $reference_catalog$;
    if p_min_price is not null or p_max_price is not null then
      -- Cada ganador elegible tiene una oferta actual. Sembrar su identidad
      -- y expandir TODAS las copias conserva la preferencia canónica vencida.
      -- El matcher completo posterior conserva las señales de la oferta.
      candidate_sql := replace(candidate_sql,'  with matched_candidates as materialized (',$current_seed$
  with possible_current_product_ids as materialized (
    -- Primer brazo: índice observed existente, incluye recálculos necesarios.
    select product_id from public.catalog_price_summaries
    where comparable_latest_observed_at>=now()-interval '24 hours'
    union all
    -- Segundo brazo disjunto: cache válida con latest anterior/ausente.
    -- Índice parcial cubre producto y latest sin cargar el JSON de precios.
    select product_id from public.catalog_price_summaries
    where comparable_stats is not null and now()<comparable_valid_until
      and (comparable_latest_observed_at<now()-interval '24 hours'
        or comparable_latest_observed_at is null)
  ), seeded_identities as materialized (
    select distinct seed.category,seed.catalog_identity
    from possible_current_product_ids current_ids
    join public.products seed on seed.id=current_ids.product_id
    where ($2 is null or seed.category=$2) and seed.catalog_component
      and ($10 is null or seed.catalog_document like '%'||$10||'%')
      and ($13='ram' or cardinality($11)>2 or not exists(
        select 1 from unnest($11) word
        where position(' '||word||' ' in ' '||seed.catalog_name||' ')=0))
  ), matched_candidates as materialized (
$current_seed$);
      candidate_sql := replace(candidate_sql,
        'from public.products p join public.catalog_price_summaries summary on summary.product_id=p.id',
        'from seeded_identities seeded join public.products p on p.category=seeded.category and p.catalog_identity=seeded.catalog_identity join public.catalog_price_summaries summary on summary.product_id=p.id');
    end if;
  end if;

  execute candidate_sql || $catalog$
, eligible as materialized (
    select id,updated_at,last_scraped_at,catalog_name,lowest,highest,average,available,comparable_available,observed_at
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

drop trigger products_search_lookup_insert on public.products;
drop trigger products_search_lookup_update on public.products;
drop trigger products_search_lookup_delete on public.products;
drop function public.sync_products_search_lookup();
drop table public.products_search_lookup;
commit;
