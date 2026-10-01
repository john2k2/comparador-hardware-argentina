-- Reparar categorías por función principal sin cambiar IDs, ofertas o historial.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.catalog_cooling_title(title text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
 SELECT public.catalog_identity_text(title) ~ '^(cpu\s+cooler|water\s*cooler|refrigeracion|ventilador|disipador)\M'
   OR public.catalog_identity_text(title) ~ '^cooler\s+(?!master\M)'
   OR public.catalog_identity_text(title) ~ '^cooler\s+master\s+(masterliquid|ml\d+[a-z0-9]*|hyper|liquid)\M';
$$;
CREATE OR REPLACE FUNCTION public.catalog_primary_category(title text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
DECLARE name text := public.catalog_identity_text(title);
BEGIN
 IF name ~ '^(pc|notebook|laptop|computadora)\M' THEN RETURN 'computadoras'; END IF;
 IF name ~ '^(mouse|mousepad|teclado|auriculares?|headset|joystick|gamepad|webcam|monitor|parlante|escritorio|tabla para standing desk|silla)\M' THEN RETURN 'perifericos'; END IF;
 IF public.catalog_cooling_title(title) THEN RETURN 'refrigeracion'; END IF;
 IF name ~ '^micro\s+sd\M' THEN RETURN 'almacenamiento'; END IF;
 IF name ~ '^(micro(?!\s+sd\M)|procesador(?:es)?|cpu)\M' THEN RETURN 'procesadores'; END IF;
 IF name ~ '^(placa de video|tarjeta grafica|gpu)\M' THEN RETURN 'tarjetas-graficas'; END IF;
 IF name ~ '^(motherboard|mother|placa madre)\M' THEN RETURN 'motherboards'; END IF;
 IF name ~ '^(gabinete|case)\M' THEN RETURN 'gabinetes'; END IF;
 IF name ~ '^(fuente|psu)\M' THEN RETURN 'fuentes-alimentacion'; END IF;
 IF name ~ '^(memoria|ram)\M' THEN RETURN 'memoria-ram'; END IF;
 IF name ~ '^(ssd|nvme|hdd|disco)\M' THEN RETURN 'almacenamiento'; END IF;
 RETURN NULL;
END $$;
create or replace function public.catalog_standalone(title text, category text)
returns boolean language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare name text := public.catalog_identity_text(title); families integer; hints integer;
begin
  if category in ('procesadores','tarjetas-graficas','memoria-ram')
    and public.catalog_primary_category(title) is not null
    and public.catalog_primary_category(title) <> category then return false; end if;
  if category not in ('procesadores','tarjetas-graficas','memoria-ram') then return true; end if;
  if public.catalog_primary_category(title)='procesadores' then
    name := regexp_replace(name,'\mpara pc armada\M','','g');
  end if;
  -- La compatibilidad de RAM/accesorios no constituye una PC ni un paquete.
  if public.catalog_primary_category(title)=category and name ~ '^(memoria|ram)\M' then return true; end if;
  if name ~ '(pc gamer|combo|armado|armada|pc completa|pc creadores|computadora|desktop|workstation|notebook|laptop|all in one|netbook|chromebook|bundle|paquete)'
    or name ~ '\m(escritorio|build)\M' then return false; end if;
  families := (name ~ '\m(ryzen|core\s*i[3579]|procesador|cpu)\M')::int
    + ((name ~ '\m(rtx|gtx|radeon|geforce|rx\s*\d{3,4}|gpu)\M')
       and not (name ~ '^(micro|procesador|cpu|amd\s+(ryzen|athlon))\M' and name ~ '\m(radeon|vega)\M'
         and name !~ '\m(rtx|gtx|geforce|rx\s*\d{3,4}|placa\s+de\s+video|tarjeta\s+grafica)\M'))::int
    + (name ~ '\m(motherboard|mother|placa\s+madre)\M')::int
    + (name ~ '\m(ddr4|ddr5|ram|memoria)\M')::int
    + (name ~ '\m(ssd|nvme|hdd|disco)\M')::int;
  if (position('+' in name) > 0 or name ~ '\m(kit|bundle|paquete)\M') and families >= 2 then return false; end if;
  hints := (name ~ '\m\d{1,2}\s*gb\M')::int + (name ~ '\m(\d+\s*tb|\d{3,4}\s*gb)\M')::int
    + (name ~ '\m[abhx]\d{3}[a-z]?\M')::int + (name ~ '\m(arc|b580)\M')::int;
  return not (name ~ '\mpc\M' and name ~ '\m(ryzen|core\s*i[3579]|procesador|cpu|rtx|gtx|radeon|geforce|gpu)\M' and families + hints >= 2);
end $$;


UPDATE public.products SET
 canonical_product_key=CASE WHEN canonical_product_key LIKE category||'::%' THEN catalog_primary_category(name)||'::'||substr(canonical_product_key,length(category)+3) ELSE canonical_product_key END,
 variant_key=CASE WHEN variant_key LIKE category||'::%' THEN catalog_primary_category(name)||'::'||substr(variant_key,length(category)+3) ELSE variant_key END,
 category=catalog_primary_category(name)
WHERE catalog_primary_category(name) IS NOT NULL
 AND catalog_primary_category(name)<>category
 AND catalog_standalone(name,catalog_primary_category(name));
-- Recalcular elegibilidad generada aun cuando la categoría no haya cambiado.
UPDATE public.products SET name=name WHERE category IN ('procesadores','tarjetas-graficas','memoria-ram')
 AND catalog_component IS DISTINCT FROM catalog_standalone(name,category);
COMMIT;
