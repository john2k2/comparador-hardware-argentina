-- Corrige únicamente nombres que comienzan con un periférico inequívoco.
-- Conserva IDs, ofertas, stock, fechas de observación, historial y referencias de usuarios.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

UPDATE public.products
SET canonical_product_key = CASE
      WHEN canonical_product_key LIKE category || '::%'
      THEN 'perifericos::' || substr(canonical_product_key, length(category) + 3)
      ELSE canonical_product_key END,
    variant_key = CASE
      WHEN variant_key LIKE category || '::%'
      THEN 'perifericos::' || substr(variant_key, length(category) + 3)
      ELSE variant_key END,
    category = 'perifericos'
WHERE category <> 'perifericos'
  AND catalog_name ~ '^(mouse|mousepad|teclado|auriculares?|headset|joystick|gamepad|webcam|monitor|parlante|escritorio|tabla para standing desk|silla)\M';

RESET lock_timeout;
RESET statement_timeout;
