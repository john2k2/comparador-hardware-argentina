BEGIN;
DO $$ BEGIN
 IF NOT public.catalog_standalone('Procesadores Core I5 10400 (PARA PC ARMADA)','procesadores') THEN RAISE EXCEPTION 'CPU para PC armada rechazada'; END IF;
 IF public.catalog_primary_category('Micro SD Kingston 128GB') <> 'almacenamiento' THEN RAISE EXCEPTION 'Micro SD como CPU'; END IF;
 IF NOT public.catalog_standalone('Procesador AMD Ryzen 5 5600GT + Radeon Vega + Cooler','procesadores') THEN RAISE EXCEPTION 'APU rechazada como bundle'; END IF;
 IF public.catalog_standalone('Procesador AMD Ryzen 5 5600GT + Radeon Vega + memoria 16GB DDR4','procesadores') THEN RAISE EXCEPTION 'Bundle aceptado como CPU'; END IF;
 IF public.catalog_primary_category('CPU Cooler Intel Performance S1700 (solo para PC armada)') <> 'refrigeracion' THEN RAISE EXCEPTION 'Accesorio convertido en CPU'; END IF;
 IF public.catalog_standalone('CPU Cooler Intel Performance S1700 (solo para PC armada)','procesadores') THEN RAISE EXCEPTION 'Cooler aceptado como CPU'; END IF;
 IF NOT public.catalog_standalone('Memoria RAM para notebook DDR5 16GB','memoria-ram') THEN RAISE EXCEPTION 'RAM notebook rechazada'; END IF;
 IF public.catalog_primary_category('Procesador AMD Ryzen 5 8600G + Radeon 760M') <> 'procesadores' THEN RAISE EXCEPTION 'APU categoria incorrecta'; END IF;
END $$;
ROLLBACK;
