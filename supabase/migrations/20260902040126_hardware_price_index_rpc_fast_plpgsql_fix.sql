begin;

create or replace function public.hardware_price_index(p_days integer default 90)
returns table (
  day date,
  category text,
  median_price_ars numeric,
  product_count bigint,
  offer_count bigint
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $function$
#variable_conflict use_column
begin
  if p_days < 7 or p_days > 365 then
    raise exception 'hardware_price_index p_days must be between 7 and 365';
  end if;

  return query
  with bounds as (
    select
      pg_catalog.timezone('America/Argentina/Buenos_Aires', pg_catalog.now())::date as today,
      (pg_catalog.timezone('America/Argentina/Buenos_Aires', pg_catalog.now())::date - p_days) as start_day
  ), current_offers as (
    select
      pp.product_id,
      pp.store_id,
      pp.url as offer_url,
      p.category
    from public.product_prices pp
    join public.products p on p.id = pp.product_id
    where pp.stock in ('in-stock', 'low-stock')
      and pp.price > 0
      and p.category in ('procesadores', 'tarjetas-graficas', 'memoria-ram', 'almacenamiento')
  ), history_quotes as (
    select
      offer.product_id,
      offer.store_id,
      offer.offer_url,
      offer.category,
      pg_catalog.timezone('America/Argentina/Buenos_Aires', ph.recorded_at)::date as quote_day,
      ph.recorded_at,
      ph.price,
      ph.stock,
      ph.id
    from current_offers offer
    join public.price_history ph
      on ph.product_id = offer.product_id
     and ph.store_id = offer.store_id
     and ph.offer_url = offer.offer_url
    where ph.recorded_at < (((select today from bounds) + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  ), daily_last as (
    select distinct on (product_id, store_id, offer_url, quote_day)
      product_id,
      store_id,
      offer_url,
      category,
      quote_day,
      price,
      stock
    from history_quotes
    order by product_id, store_id, offer_url, quote_day, recorded_at desc, id desc
  ), windows as (
    select
      product_id,
      store_id,
      offer_url,
      category,
      quote_day,
      price,
      stock,
      lead(quote_day) over (
        partition by product_id, store_id, offer_url
        order by quote_day
      ) as next_day
    from daily_last
  ), daily_offer_quotes as (
    select
      generated_day::date as quote_day,
      w.product_id,
      w.category,
      w.price
    from windows w
    cross join bounds b
    cross join lateral pg_catalog.generate_series(
      greatest(w.quote_day, b.start_day),
      least(coalesce(w.next_day - 1, b.today), b.today),
      interval '1 day'
    ) as generated_day
    where w.stock in ('in-stock', 'low-stock')
      and w.price > 0
      and greatest(w.quote_day, b.start_day) <= least(coalesce(w.next_day - 1, b.today), b.today)
  ), daily_product_prices as (
    select
      daily_quote.quote_day,
      daily_quote.category,
      daily_quote.product_id,
      min(daily_quote.price) as product_price
    from daily_offer_quotes daily_quote
    group by daily_quote.quote_day, daily_quote.category, daily_quote.product_id
  ), daily_offer_counts as (
    select daily_quote.quote_day, daily_quote.category, count(*)::bigint as offers
    from daily_offer_quotes daily_quote
    group by daily_quote.quote_day, daily_quote.category
  )
  select
    product.quote_day as day,
    product.category,
    percentile_cont(0.5) within group (order by product.product_price)::numeric as median_price_ars,
    count(*)::bigint as product_count,
    offers.offers as offer_count
  from daily_product_prices product
  join daily_offer_counts offers
    on offers.quote_day = product.quote_day
   and offers.category = product.category
  group by product.quote_day, product.category, offers.offers
  order by product.quote_day, product.category;
end;
$function$;

comment on function public.hardware_price_index(integer)
is 'Reconstruye cotizaciones historicas de ofertas hoy vigentes y calcula medianas diarias por categoria. La muestra tiene sesgo de supervivencia.';

revoke all on function public.hardware_price_index(integer) from public;
revoke all on function public.hardware_price_index(integer) from anon;
revoke all on function public.hardware_price_index(integer) from authenticated;
grant execute on function public.hardware_price_index(integer) to service_role;

commit;
