-- Acotar lecturas de resúmenes válidos por precio antes de cargar productos.
-- Los resúmenes vencidos se recalculan; la identidad preferida sigue global.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create index if not exists catalog_price_summaries_current_bounds_idx
  on public.catalog_price_summaries
    (comparable_latest_observed_at desc,((comparable_stats->>'lowest')::numeric),product_id)
  include (comparable_valid_until)
  where comparable_stats is not null and comparable_latest_observed_at is not null;
commit;
