-- La consulta paginada está optimizada, pero consultas amplias sin categoría
-- aún necesitan ~3 s. Dar margen acotado sólo a esta RPC, sin cambiar roles.
-- Supabase/PostgREST admite statement_timeout por función.
begin;
alter function public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)
  set statement_timeout='8s';
notify pgrst, 'reload schema';
commit;
