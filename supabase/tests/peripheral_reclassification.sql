-- Ejecutar en la base local aislada luego de reproducir las migraciones.
BEGIN;
INSERT INTO public.products (id, name, model, category, canonical_product_key, variant_key)
VALUES ('test-peripheral-mouse', 'Mouse Trust Gamer', 'Trust', 'procesadores', 'procesadores::generic:mouse-trust', 'procesadores::generic:mouse-trust'),
       ('test-peripheral-monitor', 'Monitor Samsung DDR4 24', 'Samsung', 'memoria-ram', 'memoria-ram::generic:monitor', 'memoria-ram::generic:monitor'),
       ('test-peripheral-cpu', 'Procesador AMD Ryzen 7600', '7600', 'procesadores', 'procesadores::amd:7600', 'procesadores::amd:7600'),
       ('test-peripheral-substring', 'Gabinete con soporte de monitor', 'Case', 'gabinetes', 'gabinetes::generic:case', 'gabinetes::generic:case');
INSERT INTO public.product_prices (product_id, store_id, price, stock, url, last_updated)
VALUES ('test-peripheral-mouse', 'mexx', 12345, 'out-of-stock', 'https://www.mexx.com.ar/test-mouse', '2026-09-01T00:00:00Z');
\ir ../migrations/20261001203932_reclassify_explicit_peripherals.sql
DO $$
BEGIN
  IF public.catalog_standalone('Monitor Samsung DDR4 24', 'memoria-ram') OR public.catalog_standalone('Mouse Gamer', 'procesadores') THEN RAISE EXCEPTION 'Acepta nuevos periféricos como componentes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id='test-peripheral-mouse' AND category='perifericos' AND canonical_product_key='perifericos::generic:mouse-trust' AND variant_key='perifericos::generic:mouse-trust') THEN RAISE EXCEPTION 'No corrigió categoría y prefijos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id='test-peripheral-monitor' AND category='perifericos' AND variant_key='perifericos::generic:monitor') THEN RAISE EXCEPTION 'No priorizó la identidad del periférico'; END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE id IN ('test-peripheral-cpu','test-peripheral-substring') AND category='perifericos') THEN RAISE EXCEPTION 'Reclasificó una coincidencia ambigua'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_prices WHERE product_id='test-peripheral-mouse' AND price=12345 AND stock='out-of-stock' AND last_updated='2026-09-01T00:00:00Z') THEN RAISE EXCEPTION 'Alteró precio, stock o fecha'; END IF;
END $$;
ROLLBACK;
