-- La categoría importada no convierte un periférico en CPU, GPU o RAM.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.catalog_primary_category(title text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
DECLARE name text := public.catalog_identity_text(title);
BEGIN
 IF name ~ '^(mouse|mousepad|teclado|auriculares?|headset|joystick|gamepad|webcam|monitor|parlante|escritorio|tabla para standing desk|silla)\M' THEN RETURN 'perifericos'; END IF;
 IF public.catalog_cooling_title(title) THEN RETURN 'refrigeracion'; END IF;
 IF name ~ '^(motherboard|mother|placa madre)\M' THEN RETURN 'motherboards'; END IF;
 IF name ~ '^(gabinete|case)\M' THEN RETURN 'gabinetes'; END IF;
 IF name ~ '^(fuente|psu)\M' THEN RETURN 'fuentes-alimentacion'; END IF;
 IF name ~ '^(memoria|ram)\M' THEN RETURN 'memoria-ram'; END IF;
 IF name ~ '^(ssd|nvme|hdd|disco)\M' THEN RETURN 'almacenamiento'; END IF;
 RETURN NULL;
END $$;
COMMIT;
