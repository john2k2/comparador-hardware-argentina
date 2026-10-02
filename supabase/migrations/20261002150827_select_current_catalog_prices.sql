-- Identidad corroborada se calcula al escribir. La ventana se evalúa al leer,
-- sin renovar observaciones ni esconder historial y antes de elegir por tienda.
begin;
alter table public.catalog_price_summaries
 add column comparable_offers jsonb not null default '[]'::jsonb,
 add column comparable_stats jsonb,
 add column comparable_valid_until timestamptz,
 add column comparable_latest_observed_at timestamptz;

create function public.catalog_current_price_stats(p_offers jsonb,p_stores text[] default '{}')
returns table(lowest numeric,highest numeric,average numeric,available bigint,urls text,offer_ids uuid[])
language sql stable parallel safe security invoker set search_path=pg_catalog,public as $$
 with current as (
  select distinct on(lower(store_id)) id,store_id,price,stock,url,last_updated
  from jsonb_to_recordset(coalesce(p_offers,'[]')) o(id uuid,store_id text,price numeric,stock text,url text,last_updated timestamptz)
  where last_updated between now()-interval '24 hours' and now()+interval '1 minute'
   and (coalesce(cardinality(p_stores),0)=0 or lower(store_id)=any(p_stores))
  order by lower(store_id),price,last_updated desc,url
 ) select s.* from public.catalog_price_stats((select coalesce(jsonb_agg(to_jsonb(o)),'[]') from current o)) s;
$$;
revoke all on function public.catalog_current_price_stats(jsonb,text[]) from public;
grant execute on function public.catalog_current_price_stats(jsonb,text[]) to anon,authenticated,service_role;


create function public.sync_catalog_comparable_summary(p_product text)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare offers jsonb; stats record; latest_at timestamptz; expires_at timestamptz; observed_at timestamptz;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',lower(o.store_id),'price',o.price,'stock',o.stock,'url',o.url,'last_updated',o.last_updated) order by o.store_id,o.price,o.id),'[]')
 into offers from public.product_prices o join public.products p on p.id=o.product_id
 where o.product_id=p_product and public.catalog_offer_is_comparable(o.price,o.stock,o.url,o.identity_review,p.name,p.category,o.source_identity,o.store_id);
 select * into stats from public.catalog_current_price_stats(offers);
 select max(last_updated),case when bool_or(last_updated>now()+interval '1 minute') then now()
   else min(last_updated+interval '24 hours') filter(where last_updated>=now()-interval '24 hours') end,
   max(last_updated) filter(where id=any(stats.offer_ids))
 into latest_at,expires_at,observed_at
 from jsonb_to_recordset(offers) o(id uuid,last_updated timestamptz);
 update public.catalog_price_summaries set comparable_offers=offers,
  comparable_stats=case when stats.lowest is not null then to_jsonb(stats)||jsonb_build_object('observed_at',observed_at) end,
  comparable_valid_until=expires_at,comparable_latest_observed_at=latest_at where product_id=p_product;
end $$;
create function public.trigger_catalog_comparable_summary()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare product_key text;
begin
 if tg_table_name='product_prices' then
  for product_key in select distinct key from unnest(array[case when tg_op<>'INSERT' then old.product_id end,case when tg_op<>'DELETE' then new.product_id end]) key where key is not null order by key loop
   perform public.sync_catalog_comparable_summary(product_key);
  end loop;
 elsif tg_table_name='products' then perform public.sync_catalog_comparable_summary(new.id);
 elsif old.url is distinct from new.url then
  for product_key in select distinct product_id from public.product_prices where store_id=new.id order by product_id loop
   perform public.sync_catalog_comparable_summary(product_key);
  end loop;
 end if;
 return null;
end $$;
-- Alfabéticamente posterior al trigger del resumen histórico; comparte su lock.
create trigger product_prices_usable_summary after insert or update or delete on public.product_prices
for each row execute function public.trigger_catalog_comparable_summary();
create trigger products_usable_summary after update of name,category on public.products
for each row when(old.name is distinct from new.name or old.category is distinct from new.category) execute function public.trigger_catalog_comparable_summary();
create trigger stores_usable_summary after update of url on public.stores
for each row when(old.url is distinct from new.url) execute function public.trigger_catalog_comparable_summary();
revoke all on function public.sync_catalog_comparable_summary(text),public.trigger_catalog_comparable_summary() from public,anon,authenticated;
grant execute on function public.sync_catalog_comparable_summary(text) to service_role;
-- Backfill exclusivo del agregado, sin escribir ofertas ni fechas observadas.
do $$ declare product_key text; begin
 for product_key in select product_id from public.catalog_price_summaries order by product_id loop
  perform public.sync_catalog_comparable_summary(product_key);
 end loop;
end $$;

create or replace function public.search_catalog_page(
  p_query text default '',p_category text default null,p_stores text[] default '{}',
  p_min_price numeric default null,p_max_price numeric default null,
  p_sort text default 'relevance',p_page integer default 1,p_page_size integer default 12
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public set jit=off set statement_timeout='8s' as $$
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
  ), eligible as materialized (
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
