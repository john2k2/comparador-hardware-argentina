-- El orden global derramaba a disco y podía agotar los ocho segundos de lectura.
-- Límite por operación de orden/hash dentro de esta RPC; no cambia el servidor.
alter function public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)
  set work_mem = '16MB';
