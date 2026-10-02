-- Reparar categorías por función principal sin cambiar IDs, ofertas o historial.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.catalog_cooling_title(title text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
 SELECT public.catalog_identity_text(title) ~ '^(cpu\s+cooler|water\s*cooler|refrigeracion|ventilador|disipador|pasta\s+termica|thermal\s+pad)\M'
   OR public.catalog_identity_text(title) ~ '^cooler\s+(?!master\M)'
   OR public.catalog_identity_text(title) ~ '^cooler\s+master\s+(masterliquid|ml\d+[a-z0-9]*|hyper|liquid)\M';
$$;
CREATE OR REPLACE FUNCTION public.catalog_primary_category(title text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
DECLARE name text := public.catalog_identity_text(title);
BEGIN
 IF name ~ '^(pc|notebook|laptop|computadora)\M' THEN RETURN 'computadoras'; END IF;
 IF name ~ '^(mouse|mousepad|teclado|auriculares?|headset|joystick|gamepad|webcam|monitor|parlante|escritorio|tabla para standing desk|silla)\M' THEN RETURN 'perifericos'; END IF;
 IF name ~ '^(router|extensor de red|placa de red|placa wifi|adaptador( de red| wifi| bluetooth)|cable|ups|impresora|toner|powered usb hub|usb hub|elgato stream deck)\M' THEN RETURN 'perifericos'; END IF;
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
-- Reparar sólo prefijos de accesorios constatados; conservar fechas de las ofertas.
UPDATE public.products SET
 canonical_product_key=CASE WHEN canonical_product_key LIKE category||'::%' THEN catalog_primary_category(name)||'::'||substr(canonical_product_key,length(category)+3) ELSE canonical_product_key END,
 variant_key=CASE WHEN variant_key LIKE category||'::%' THEN catalog_primary_category(name)||'::'||substr(variant_key,length(category)+3) ELSE variant_key END,
 category=catalog_primary_category(name)
WHERE catalog_identity_text(name) ~ '^(router|extensor de red|placa de red|placa wifi|adaptador( de red| wifi| bluetooth)|cable|ups|impresora|toner|powered usb hub|usb hub|elgato stream deck|pasta\s+termica|thermal\s+pad)\M'
 AND catalog_primary_category(name) IS NOT NULL AND catalog_primary_category(name)<>category;
COMMIT;
