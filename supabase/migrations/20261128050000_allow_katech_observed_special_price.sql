-- Katech: aceptar el precio especial de efectivo/transferencia observado en la ficha.
--
-- Evidencia (28/11/2026, 04:46 UTC, fichas públicas con stock):
--  - https://katech.com.ar/producto/procesador-amd-ryzen-5-7600x3d-am5/ (SKU CPU364):
--    «Precio especial EFECTIVO/TRANSFERENCIA» $455.700; «Precio de lista» $592.410.
--  - https://katech.com.ar/producto/procesador-amd-ryzen-3-3200g-am4-oem-nobox/ (SKU CPU271):
--    «Precio especial EFECTIVO/TRANSFERENCIA» $110.730; «Precio de lista» $143.949.
--  El Store API devuelve el mismo importe que la etiqueta especial (45570000 y 11073000 centavos).
--  El parser sólo marca 'special' cuando todas las etiquetas visibles dicen exactamente eso
--  (parseKatechAcuDetail y katechSpecialPriceMatches en woocommerce-shared.ts).
--
-- Sin esta lista, persist_adaptive_offer devolvía false para todas las observaciones de Katech:
-- 0 guardadas en las corridas 46090093869, 46096645827 y 46096902325 (6.797 ofertas en cola).
-- La condición queda registrada como 'special'; no se convierte en precio de lista.
--
-- Sólo cambia la lista de tiendas del guard. Si la función no contiene exactamente una vez
-- la lista revisada, se detiene sin tocar nada. Es idempotente: si Katech ya está, no hace nada.
-- Revertir: misma operación con las listas invertidas.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $migration$
declare
 signature regprocedure := 'public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text)'::regprocedure;
 definition text;
 old_guard text := $$previous.store_id not in ('compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','maximus','goldentechstore')$$;
 new_guard text := $$previous.store_id not in ('compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','maximus','goldentechstore','katech')$$;
 occurrences integer;
begin
 select pg_get_functiondef(signature) into definition;
 if strpos(definition,new_guard)>0 then
  raise notice 'KATECH_PERSIST_ALREADY_ALLOWED';
  return;
 end if;
 occurrences := (length(definition) - length(replace(definition,old_guard,''))) / length(old_guard);
 if occurrences <> 1 then raise exception 'KATECH_PERSIST_GUARD_UNEXPECTED (%)', occurrences; end if;
 -- Conservar las propiedades originales y los permisos de CREATE OR REPLACE.
 execute replace(definition,old_guard,new_guard);
end $migration$;
commit;
