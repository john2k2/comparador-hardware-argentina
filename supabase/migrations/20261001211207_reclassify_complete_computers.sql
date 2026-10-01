-- PCs y notebooks completos tampoco son componentes individuales.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.catalog_primary_category(title text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
DECLARE name text := public.catalog_identity_text(title);
BEGIN
 IF name ~ '^(pc|notebook|laptop|computadora)\M' THEN RETURN 'computadoras'; END IF;
 IF name ~ '^(mouse|mousepad|teclado|auriculares?|headset|joystick|gamepad|webcam|monitor|parlante|escritorio|tabla para standing desk|silla)\M' THEN RETURN 'perifericos'; END IF;
 IF public.catalog_cooling_title(title) THEN RETURN 'refrigeracion'; END IF;
 IF name ~ '^(motherboard|mother|placa madre)\M' THEN RETURN 'motherboards'; END IF;
 IF name ~ '^(gabinete|case)\M' THEN RETURN 'gabinetes'; END IF;
 IF name ~ '^(fuente|psu)\M' THEN RETURN 'fuentes-alimentacion'; END IF;
 IF name ~ '^(memoria|ram)\M' THEN RETURN 'memoria-ram'; END IF;
 IF name ~ '^(ssd|nvme|hdd|disco)\M' THEN RETURN 'almacenamiento'; END IF;
 RETURN NULL;
END $$;


UPDATE public.products SET
 canonical_product_key=CASE WHEN canonical_product_key LIKE category||'::%' THEN 'computadoras::'||substr(canonical_product_key,length(category)+3) ELSE canonical_product_key END,
 variant_key=CASE WHEN variant_key LIKE category||'::%' THEN 'computadoras::'||substr(variant_key,length(category)+3) ELSE variant_key END,
 category='computadoras'
WHERE category<>'computadoras' AND catalog_name ~ '^(pc|notebook|laptop|computadora)\M';
COMMIT;

