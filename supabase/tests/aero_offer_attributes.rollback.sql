-- Reversión exacta; aborta si hay cambios posteriores en la función.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $rollback$
declare
  target oid := 'public.catalog_exact_offer_attributes(text,text)'::regprocedure;
  definition text;
  current_body text;
  old_series text := '''hellhound'',''red devil'']';
  new_series text := '''hellhound'',''red devil'',''aero'']';
begin
  select pg_get_functiondef(p.oid),p.prosrc into definition,current_body from pg_proc p where p.oid=target;
  if md5(current_body)<>'db0fb7df218b959f5b9084961e0df761' or md5(replace(current_body,new_series,old_series))<>'9ba74076103d4ee6db60fd5a74ea1ad3' then
    raise exception 'AERO_ROLLBACK_DRIFT';
  end if;
  execute replace(definition,new_series,old_series);
  if (select md5(prosrc) from pg_proc where oid=target)<>'9ba74076103d4ee6db60fd5a74ea1ad3' then raise exception 'AERO_ROLLBACK_MISMATCH'; end if;
end $rollback$;
commit;
