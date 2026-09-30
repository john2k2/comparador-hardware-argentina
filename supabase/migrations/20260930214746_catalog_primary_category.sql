-- Las menciones de compatibilidad tampoco convierten gabinete/mother/RAM en CPU.
begin;
set local lock_timeout='5s'; set local statement_timeout='60s';
create or replace function public.catalog_primary_category(title text)
returns text language plpgsql immutable parallel safe set search_path=pg_catalog,public as $$
declare name text := public.catalog_identity_text(title);
begin
 if public.catalog_cooling_title(title) then return 'refrigeracion'; end if;
 if name ~ '^(motherboard|mother|placa madre)\M' then return 'motherboards'; end if;
 if name ~ '^(gabinete|case)\M' then return 'gabinetes'; end if;
 if name ~ '^(fuente|psu)\M' then return 'fuentes-alimentacion'; end if;
 if name ~ '^(memoria|ram)\M' then return 'memoria-ram'; end if;
 if name ~ '^(ssd|nvme|hdd|disco)\M' then return 'almacenamiento'; end if;
 return null;
end $$;
update public.products set category=public.catalog_primary_category(name)
where category in ('procesadores','tarjetas-graficas','memoria-ram')
 and catalog_name ~ '^(motherboard|mother|placa madre|gabinete|case|fuente|psu|memoria|ram|ssd|nvme|hdd|disco)\M'
 and public.catalog_primary_category(name) <> category
 and public.catalog_standalone(name,category);
create or replace function public.catalog_standalone(title text, category text)
returns boolean language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare name text := public.catalog_identity_text(title); families integer; hints integer;
begin
  if category in ('procesadores','tarjetas-graficas','memoria-ram')
    and public.catalog_primary_category(title) is not null
    and public.catalog_primary_category(title) <> category then return false; end if;
  if category not in ('procesadores','tarjetas-graficas','memoria-ram') then return true; end if;
  if name ~ '(pc gamer|combo|armado|armada|pc completa|pc creadores|computadora|desktop|workstation|notebook|laptop|all in one|netbook|chromebook|bundle|paquete)'
    or name ~ '\m(escritorio|build)\M' then return false; end if;
  families := (name ~ '\m(ryzen|core\s*i[3579]|procesador|cpu)\M')::int
    + (name ~ '\m(rtx|gtx|radeon|geforce|rx\s*\d{3,4}|gpu)\M')::int
    + (name ~ '\m(motherboard|mother|placa\s+madre)\M')::int
    + (name ~ '\m(ddr4|ddr5|ram|memoria)\M')::int
    + (name ~ '\m(ssd|nvme|hdd|disco)\M')::int;
  if (position('+' in name) > 0 or name ~ '\m(kit|bundle|paquete)\M') and families >= 2 then return false; end if;
  hints := (name ~ '\m\d{1,2}\s*gb\M')::int + (name ~ '\m(\d+\s*tb|\d{3,4}\s*gb)\M')::int
    + (name ~ '\m[abhx]\d{3}[a-z]?\M')::int + (name ~ '\m(arc|b580)\M')::int;
  return not (name ~ '\mpc\M' and name ~ '\m(ryzen|core\s*i[3579]|procesador|cpu|rtx|gtx|radeon|geforce|gpu)\M' and families + hints >= 2);
end $$;

commit;
