-- Corte remoto revisado 09/10/2026: cambiar únicamente la condición de pago Maximus.
-- Si la función cambió, detenerse y revisar el contrato nuevo antes de reemplazarlo.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $migration$
declare
 signature regprocedure := 'public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text)'::regprocedure;
 definition text;
 old_guard text := $$previous.store_id not in ('compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek')$$;
 new_guard text := $$previous.store_id not in ('compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','maximus')$$;
begin
 select pg_get_functiondef(signature) into definition;
 if md5(definition) <> 'f66ccd0f002da0ddf8b8b4f8e8ecd992' then
  raise exception 'MAXIMUS_PERSIST_BASELINE_CHANGED';
 end if;
 if strpos(definition,old_guard)=0 then raise exception 'MAXIMUS_PERSIST_GUARD_MISSING'; end if;
 -- CREATE OR REPLACE conserva propietario, SECURITY INVOKER, search_path y ACL.
 execute replace(definition,old_guard,new_guard);
end $migration$;
commit;
