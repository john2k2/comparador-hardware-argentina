-- AERO es una serie explícita de placa. No altera claves, filas ni observaciones.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $migration$
declare
  target oid := 'public.catalog_exact_offer_attributes(text,text)'::regprocedure;
  before_definition text;
  before_metadata jsonb;
  before_hash text;
  old_series text := '''hellhound'',''red devil'']';
  new_series text := '''hellhound'',''red devil'',''aero'']';
begin
  select pg_get_functiondef(p.oid), md5(p.prosrc),
    jsonb_build_object('oid',p.oid,'acl',p.proacl,'config',p.proconfig,'security',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict)
  into before_definition,before_hash,before_metadata from pg_proc p where p.oid=target;
  if before_hash <> '9ba74076103d4ee6db60fd5a74ea1ad3'
    or position(old_series in before_definition)=0
    or before_metadata->>'security'<>'false' then
    raise exception 'AERO_BASELINE_DRIFT';
  end if;
  execute replace(before_definition,old_series,new_series);
  if before_metadata <> (select jsonb_build_object('oid',p.oid,'acl',p.proacl,'config',p.proconfig,'security',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict) from pg_proc p where p.oid=target)
    or (select md5(p.prosrc) from pg_proc p where p.oid=target) <> 'db0fb7df218b959f5b9084961e0df761' then
    raise exception 'AERO_FUNCTION_INVARIANT_FAILED';
  end if;
end $migration$;
commit;
