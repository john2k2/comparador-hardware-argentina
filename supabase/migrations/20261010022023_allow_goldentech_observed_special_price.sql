-- GoldenTech: el Store API corrobora el precio de transferencia/efectivo de la ficha.
-- Detenerse si cambió la función productiva revisada, sin ampliar otros contratos.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $migration$
declare
 signature regprocedure := 'public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text)'::regprocedure;
 definition text;
 old_guard text := $$previous.store_id not in ('compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','maximus')$$;
 new_guard text := $$previous.store_id not in ('compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','maximus','goldentechstore')$$;
begin
 select pg_get_functiondef(signature) into definition;
 if md5(definition) <> '062951d3e6d564e00328c24830b09e0e' then
  raise exception 'GOLDENTECH_PERSIST_BASELINE_CHANGED';
 end if;
 if strpos(definition,old_guard)=0 then raise exception 'GOLDENTECH_PERSIST_GUARD_MISSING'; end if;
 -- Conservar las propiedades originales y los permisos de CREATE OR REPLACE.
 execute replace(definition,old_guard,new_guard);
end $migration$;
commit;
