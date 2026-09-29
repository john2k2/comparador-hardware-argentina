-- Las columnas generadas nuevas necesitan estadísticas propias. Esta RPC sirve
-- páginas pequeñas con filtros variables: no amortiza compilación JIT ni un plan
-- genérico que asuma la misma selectividad para catálogo global y modelo exacto.
begin;
analyze public.products;
analyze public.catalog_price_summaries;
alter function public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer) set jit=off;
alter function public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer) set plan_cache_mode=force_custom_plan;
commit;
