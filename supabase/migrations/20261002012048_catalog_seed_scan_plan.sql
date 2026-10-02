-- LIMIT supone muchas filas pendientes y elige miles de lecturas aleatorias.
-- La cola casi completa necesita un barrido; el ajuste afecta sólo esta RPC privada.
alter function public.seed_catalog_refresh_queue() set enable_nestloop=off;
alter function public.seed_catalog_refresh_queue() set enable_mergejoin=off;
