BEGIN;
INSERT INTO public.products(id,name,model,category,canonical_product_key,variant_key)
VALUES ('computer-test','PC AMD 5600GT 16GB 480GB W11 RGB monitor 22','5600GT','memoria-ram','memoria-ram::generic:pc','memoria-ram::generic:pc');
DO $$ BEGIN
 IF public.catalog_standalone('PC AMD 5600GT 16GB 480GB W11 RGB monitor 22','memoria-ram') THEN RAISE EXCEPTION 'PC aceptada como RAM'; END IF;
 IF public.catalog_primary_category('PC AMD 5600GT 16GB 480GB W11 RGB monitor 22') <> 'computadoras' THEN RAISE EXCEPTION 'No identifica la PC'; END IF;
 IF public.catalog_primary_category('PCIe SSD Kingston')='computadoras' THEN RAISE EXCEPTION 'Confunde PCIe con PC'; END IF;
 IF (SELECT catalog_component FROM products WHERE id='computer-test') THEN RAISE EXCEPTION 'Columna generada acepta la categoría importada incorrecta'; END IF;
END $$;
ROLLBACK;
