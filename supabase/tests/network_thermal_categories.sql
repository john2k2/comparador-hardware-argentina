BEGIN;
INSERT INTO products(id,name,model,category,canonical_product_key,variant_key) VALUES
 ('test-network-router','Router Tp-Link DDR4','Router','memoria-ram','memoria-ram::router','memoria-ram::router'),
 ('test-network-ups','UPS con Estabilizador 800VA','UPS','fuentes-alimentacion','fuentes-alimentacion::ups','fuentes-alimentacion::ups'),
 ('test-thermal-pad','Thermal Pad Carbice Ice para CPU AM4','Thermal','procesadores','procesadores::thermal','procesadores::thermal'),
 ('test-network-mother','Mother ASUS con WIFI DDR4','Mother','motherboards','motherboards::mother','motherboards::mother');
INSERT INTO product_prices(product_id,store_id,url,price,stock,last_updated) VALUES
 ('test-network-router','mexx','https://example.invalid/router',12345,'unknown','2026-09-01T00:00:00Z');
\ir ../migrations/20261002013204_reclassify_network_and_thermal_accessories.sql
DO $$ BEGIN
 ASSERT (select category='perifericos' and variant_key='perifericos::router' from products where id='test-network-router');
 ASSERT (select category='perifericos' from products where id='test-network-ups');
 ASSERT (select category='refrigeracion' from products where id='test-thermal-pad');
 ASSERT (select category='motherboards' from products where id='test-network-mother');
 ASSERT NOT catalog_standalone('Cable DisplayPort para RTX 5070','tarjetas-graficas');
 ASSERT NOT catalog_standalone('Thermal Pad para CPU AM4','procesadores');
 ASSERT (select price=12345 and stock='unknown' and last_updated='2026-09-01T00:00:00Z' from product_prices where product_id='test-network-router');
 ASSERT (select q.category='perifericos' from catalog_offer_refresh_state q join product_prices pp on pp.id=q.offer_id where pp.product_id='test-network-router');
END $$;
-- La migración confirma su transacción; borrar únicamente nuestras fixtures.
DELETE FROM product_prices WHERE product_id='test-network-router';
DELETE FROM products WHERE id IN ('test-network-router','test-network-ups','test-thermal-pad','test-network-mother');
