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
begin
  if p_days < 7 or p_days > 365 then
    raise exception 'hardware_price_index p_days must be between 7 and 365';
  end if;

  return query
  with requested_days as (
    select generated_day::date as quote_day
    from pg_catalog.generate_series(
      (pg_catalog.timezone('America/Argentina/Buenos_Aires', pg_catalog.now())::date - p_days),
      pg_catalog.timezone('America/Argentina/Buenos_Aires', pg_catalog.now())::date,
      interval '1 day'
    ) as generated_day
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
  ), daily_offer_quotes as (
    select
      d.quote_day,
      offer.product_id,
      offer.store_id,
      offer.offer_url,
      offer.category,
      quote.price
    from requested_days d
    cross join current_offers offer
    cross join lateral (
      select ph.price, ph.stock
      from public.price_history ph
      where ph.product_id = offer.product_id
        and ph.store_id = offer.store_id
        and ph.offer_url = offer.offer_url
        and ph.recorded_at < ((d.quote_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
      order by ph.recorded_at desc, ph.id desc
      limit 1
    ) quote
    where quote.stock in ('in-stock', 'low-stock')
      and quote.price > 0
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
