-- Meta de cobertura redefinida el 28/11/2026 (decisión de Jonathan): componentes CON STOCK
-- observados en 24 h. Agotado o reserva no es un precio comprable; medir su frescura junto con
-- las ofertas con stock mezclaba dos cosas distintas.
--
-- Agrega tres conteos por grupo, sin cambiar los existentes:
--   stock_total        ofertas cuya última observación fue 'in-stock' o 'low-stock';
--   stock_observed_24h esas mismas, observadas en las últimas 24 h;
--   stock_observed_3h  esas mismas, observadas en las últimas 3 h.
-- "Con stock" es el último estado observado: una oferta con stock vista hace un mes sigue en el
-- denominador y no en el numerador. No se infiere stock ni agotamiento por vencimiento.
--
-- Los campos anteriores (total, observed_24h, within_policy...) quedan iguales para comparar.
-- La ventana de siete días de la meta del 95 % se reinicia el día en que se aplica esta migración.
-- CREATE OR REPLACE conserva propietario y permisos; jit=off se repite porque los SET no se heredan.
-- Revertir: recrear la definición de 20261001184805_adaptive_catalog_refresh.sql con set jit=off.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.catalog_refresh_coverage() returns jsonb
language sql stable security invoker set search_path = pg_catalog, public set jit = off as $$
  select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from (
    select v.store_id, v.reason, v.interval_hours, count(*) total,
      count(*) filter (where v.last_updated between now()-interval '3 hours' and now()+interval '1 minute') observed_3h,
      count(*) filter (where v.last_updated between now()-interval '24 hours' and now()+interval '1 minute') observed_24h,
      count(*) filter (where v.last_updated between now()-make_interval(hours=>v.interval_hours) and now()+interval '1 minute') within_policy,
      count(*) filter (where v.last_attempt_at is null) never_attempted,
      min(v.last_attempt_at) oldest_attempt_at, min(v.last_updated) oldest_observation_at,
      count(*) filter (where pp.stock in ('in-stock','low-stock')) stock_total,
      count(*) filter (where pp.stock in ('in-stock','low-stock')
        and v.last_updated between now()-interval '24 hours' and now()+interval '1 minute') stock_observed_24h,
      count(*) filter (where pp.stock in ('in-stock','low-stock')
        and v.last_updated between now()-interval '3 hours' and now()+interval '1 minute') stock_observed_3h
    from public.catalog_refresh_policy v
    join public.product_prices pp on pp.id = v.offer_id
    group by v.store_id, v.reason, v.interval_hours order by v.store_id, v.reason
  ) g;
$$;
commit;
