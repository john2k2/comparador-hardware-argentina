-- Resumen transaccional de lectura. Cada cambio de oferta actualiza sólo su
-- producto; una búsqueda global ya no reconstruye todos los precios del catálogo.
begin;

create function public.catalog_price_stats(p_offers jsonb)
returns table(lowest numeric,highest numeric,average numeric,available bigint,urls text,offer_ids uuid[])
language sql immutable parallel safe set search_path=pg_catalog,public as $$
  with offers as (
    select * from jsonb_to_recordset(coalesce(p_offers,'[]')) as o(id uuid,price numeric,stock text,url text)
    where price>0 and price::text not in ('NaN','Infinity','-Infinity')
  ), counts as (
    select count(*) filter(where stock<>'out-of-stock') as available,string_agg(url,' ') as urls,
      coalesce(array_agg(id) filter(where stock='out-of-stock'),'{}'::uuid[]) as unavailable_ids from offers
  ), basis as (
    select o.* from offers o cross join counts n where n.available=0 or o.stock<>'out-of-stock'
  ), median as (
    select count(*) as n,min(price) as minimum,max(price) as maximum,
      percentile_cont(0.5) within group(order by price)::numeric as value from basis
  ), checked as (
    select b.*,case when m.n<=1 then true
      when m.n=2 then not(m.maximum/m.minimum>=4 and m.maximum-m.minimum>=150000 and b.price=m.maximum)
      else not((b.price/m.value>=2.6 or b.price/m.value<=0.38)
        and abs(b.price-m.value)>=greatest(50000,round(m.value*0.35))) end as comparable
    from basis b cross join median m
  ), accepted as (
    select * from checked where comparable or not exists(select 1 from checked where comparable)
  ), stats as (
    select min(price) as lowest,max(price) as highest,round(avg(price)) as average,array_agg(id) as offer_ids from accepted
  )
  select s.lowest,s.highest,s.average,n.available,n.urls,
    s.offer_ids || case when n.available>0 then n.unavailable_ids else '{}'::uuid[] end
  from stats s cross join counts n where s.lowest is not null;
$$;

create table public.catalog_price_summaries (
  product_id text primary key references public.products(id) on update cascade on delete cascade,
  lowest numeric not null, highest numeric not null, average numeric not null,
  available bigint not null, urls text not null, offer_ids uuid[] not null,
  store_ids text[] not null, best_offers jsonb not null
);
alter table public.catalog_price_summaries enable row level security;
create policy catalog_price_summaries_read on public.catalog_price_summaries for select to anon,authenticated using(true);
grant select on public.catalog_price_summaries to anon,authenticated;
grant select,insert,update,delete on public.catalog_price_summaries to service_role;
create index catalog_price_summaries_lowest_idx on public.catalog_price_summaries(lowest,product_id);
create index catalog_price_summaries_stores_idx on public.catalog_price_summaries using gin(store_ids);

create function public.sync_catalog_price_summary()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare product_key text; offers jsonb; stores text[];
begin
  for product_key in select distinct key from unnest(array[
    case when tg_op<>'INSERT' then old.product_id end,
    case when tg_op<>'DELETE' then new.product_id end
  ]) key where key is not null order by key loop
    -- Serializar ofertas distintas de la misma ficha. Tras esperar, la siguiente
    -- sentencia VOLATILE ve el estado confirmado y evita resúmenes perdidos.
    perform 1 from public.products where id=product_key for update;
    if not found then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',lower(o.store_id),'price',o.price,'stock',o.stock,'url',o.url)),'[]'),
      coalesce(array_agg(lower(o.store_id)),'{}') into offers,stores
    from (
      select distinct on(lower(pp.store_id)) pp.id,pp.store_id,pp.price,pp.stock,pp.url
      from public.product_prices pp where pp.product_id=product_key
        and pp.price>0 and pp.price::text not in ('NaN','Infinity','-Infinity')
      order by lower(pp.store_id),(pp.stock='out-of-stock'),
        (pp.identity_review is not null and (pp.identity_review->>'status' is distinct from 'consistent'
          or pp.identity_review#>>'{subject,url}' is distinct from pp.url)),pp.price,pp.last_updated desc,pp.url
    ) o;
    insert into public.catalog_price_summaries(product_id,lowest,highest,average,available,urls,offer_ids,store_ids,best_offers)
    select product_key,s.*,stores,offers from public.catalog_price_stats(offers) s
    on conflict(product_id) do update set lowest=excluded.lowest,highest=excluded.highest,
      average=excluded.average,available=excluded.available,urls=excluded.urls,
      offer_ids=excluded.offer_ids,store_ids=excluded.store_ids,best_offers=excluded.best_offers;
    if not found then delete from public.catalog_price_summaries where product_id=product_key; end if;
  end loop;
  return null;
end $$;
create trigger product_prices_catalog_summary after insert or update or delete on public.product_prices
for each row execute function public.sync_catalog_price_summary();

with best as (
  select distinct on(pp.product_id,lower(pp.store_id)) pp.product_id,pp.id,pp.store_id,pp.price,pp.stock,pp.url
  from public.product_prices pp where pp.price>0 and pp.price::text not in ('NaN','Infinity','-Infinity')
  order by pp.product_id,lower(pp.store_id),(pp.stock='out-of-stock'),
    (pp.identity_review is not null and (pp.identity_review->>'status' is distinct from 'consistent'
      or pp.identity_review#>>'{subject,url}' is distinct from pp.url)),pp.price,pp.last_updated desc,pp.url
), offers as (
  select product_id,array_agg(lower(store_id)) as store_ids,
    jsonb_agg(jsonb_build_object('id',id,'store_id',lower(store_id),'price',price,'stock',stock,'url',url)) as items
  from best group by product_id
)
insert into public.catalog_price_summaries(product_id,lowest,highest,average,available,urls,offer_ids,store_ids,best_offers)
select o.product_id,s.*,o.store_ids,o.items from offers o cross join lateral public.catalog_price_stats(o.items) s;

create or replace function public.search_catalog_page(
  p_query text default '',p_category text default null,p_stores text[] default '{}',
  p_min_price numeric default null,p_max_price numeric default null,
  p_sort text default 'relevance',p_page integer default 1,p_page_size integer default 12
) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare normalized_query text := public.catalog_search_text(p_query); candidate text; result jsonb;
begin
  if p_page is null or p_page<1 or p_page_size is null or p_page_size not between 1 and 48
    or p_sort is null or p_sort not in ('relevance','price-asc','price-desc','name','newest')
    or length(coalesce(p_query,''))>240 or cardinality(p_stores)>80
    or p_min_price<0 or p_max_price<0 then raise exception 'Invalid catalog page parameters'; end if;
  select word into candidate from unnest(string_to_array(normalized_query,' ')) word
    where length(word)>1 order by (word~'[0-9]') desc,length(word) desc,word limit 1;

  with candidates as (
    select p.id,p.name,p.category,p.updated_at,p.last_scraped_at,p.catalog_name,p.catalog_identity,
      stats.lowest,stats.highest,stats.average,stats.available,stats.offer_ids,
      row_number() over(partition by p.category,p.catalog_identity
        order by (p.id like 'agrupado-%') desc,p.last_scraped_at desc nulls last,p.updated_at desc,p.id) as identity_rank
    from public.products p join public.catalog_price_summaries summary on summary.product_id=p.id
    cross join lateral (
      select summary.lowest,summary.highest,summary.average,summary.available,summary.urls,summary.offer_ids
        where coalesce(cardinality(p_stores),0)=0
      union all
      select filtered.* from public.catalog_price_stats((
        select coalesce(jsonb_agg(offer),'[]') from jsonb_array_elements(summary.best_offers) offer
        where offer->>'store_id'=any(p_stores)
      )) filtered where coalesce(cardinality(p_stores),0)>0
    ) stats
    where (p_category is null or p.category=p_category) and p.catalog_component
      and (candidate is null or p.catalog_document like '%'||candidate||'%')
      and (coalesce(cardinality(p_stores),0)=0 or summary.store_ids && p_stores)
      and (normalized_query='' or public.catalog_matches_query(p.name,p.catalog_document,p_query,stats.urls))
  ), eligible as materialized (
    select * from candidates where identity_rank=1
      and (p_min_price is null or lowest>=p_min_price) and (p_max_price is null or lowest<=p_max_price)
  ), scored as (
    select e.*,case when normalized_query='' then 0 else
      25*(select count(*) from unnest(string_to_array(normalized_query,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')>0)
      + case when not exists(select 1 from unnest(string_to_array(normalized_query,' ')) word where length(word)>1 and position(' '||word||' ' in ' '||e.catalog_name||' ')=0) then 120 else 0 end
      + case when position(' '||normalized_query||' ' in ' '||e.catalog_name||' ')>0 then 120 else 0 end
      + greatest(0,20-floor(e.lowest/200000))+least(15,greatest(0,e.available-1)*5)
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
      case when p_sort='relevance' then lowest end asc,id asc) as position from scored
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
      (to_jsonb(p)-'catalog_name'-'catalog_document'-'catalog_identity'-'catalog_component')||jsonb_build_object(
        'lowest_price',r.lowest,'highest_price',r.highest,'average_price',r.average,
        'product_prices',(select jsonb_agg(to_jsonb(o) order by o.price,o.store_id,o.url)
          from public.product_prices o where o.id=any(r.offer_ids))
      ) order by r.position) from page_rows r join public.products p on p.id=r.id),'[]'::jsonb))
  into result from bounds b;
  return result;
end $$;

revoke all on function public.sync_catalog_price_summary() from public,anon,authenticated;
revoke all on function public.catalog_price_stats(jsonb) from public;
-- El helper puro también lo usa la RPC invoker al seleccionar tiendas.
grant execute on function public.catalog_price_stats(jsonb) to anon,authenticated,service_role;
grant execute on function public.sync_catalog_price_summary() to service_role;

-- Los escritores existentes toman el bloqueo de ficha ANTES del de oferta.
-- Se conservan sus validaciones y transacciones en helpers no invocables por API.
alter function public.persist_catalog_offers(jsonb) rename to persist_catalog_offers_unlocked;
revoke all on function public.persist_catalog_offers_unlocked(jsonb) from public,anon,authenticated,service_role;
create function public.persist_catalog_offers(p_offers jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_offers is null or jsonb_typeof(p_offers)<>'array' then raise exception 'p_offers must be an array'; end if;
  if jsonb_array_length(p_offers)>250 then raise exception 'p_offers exceeds 250 offers'; end if;
  perform 1 from public.products where id in(select value->>'product_id' from jsonb_array_elements(p_offers)) order by id for update;
  perform public.persist_catalog_offers_unlocked(p_offers);
end $$;

alter function public.persist_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text) rename to persist_priority_offer_unlocked;
revoke all on function public.persist_priority_offer_unlocked(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text) from public,anon,authenticated,service_role;
create function public.persist_priority_offer(
  p_product_id text,p_store_id text,p_url text,p_price numeric,p_original_price numeric,p_stock text,
  p_installment_count integer,p_installment_amount numeric,p_run_started_at timestamptz,p_observed_at timestamptz,p_review jsonb,p_signature text
) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform 1 from public.products where id=p_product_id for update;
  return public.persist_priority_offer_unlocked(p_product_id,p_store_id,p_url,p_price,p_original_price,p_stock,
    p_installment_count,p_installment_amount,p_run_started_at,p_observed_at,p_review,p_signature);
end $$;

alter function public.persist_requested_offer(uuid,uuid,text,text,text,numeric,numeric,text,integer,numeric,timestamptz,jsonb,text) rename to persist_requested_offer_unlocked;
revoke all on function public.persist_requested_offer_unlocked(uuid,uuid,text,text,text,numeric,numeric,text,integer,numeric,timestamptz,jsonb,text) from public,anon,authenticated,service_role;
create function public.persist_requested_offer(
  p_job_id uuid,p_lease_token uuid,p_product_id text,p_store_id text,p_url text,p_price numeric,p_original_price numeric,p_stock text,
  p_installment_count integer,p_installment_amount numeric,p_observed_at timestamptz,p_review jsonb,p_signature text
) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform 1 from public.products where id=p_product_id for update;
  return public.persist_requested_offer_unlocked(p_job_id,p_lease_token,p_product_id,p_store_id,p_url,p_price,p_original_price,p_stock,
    p_installment_count,p_installment_amount,p_observed_at,p_review,p_signature);
end $$;

revoke all on function public.persist_catalog_offers(jsonb),public.persist_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text),public.persist_requested_offer(uuid,uuid,text,text,text,numeric,numeric,text,integer,numeric,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.persist_catalog_offers(jsonb),public.persist_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text),public.persist_requested_offer(uuid,uuid,text,text,text,numeric,numeric,text,integer,numeric,timestamptz,jsonb,text) to service_role;
commit;
