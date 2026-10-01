BEGIN;
INSERT INTO stores(id,name,url,is_active) VALUES ('compragamer','CompraGamer','https://compragamer.com',true),('mexx','Mexx','https://mexx.com.ar',true),('maxtecno','MaxTecno','https://maxtecno.com.ar',true),('katech','Katech','https://katech.com.ar',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
INSERT INTO products(id,name,model,category) VALUES ('feed-claim-cpu','Procesador AMD Ryzen 7600','7600','procesadores');
INSERT INTO product_prices(product_id,store_id,url,price,stock,last_updated) VALUES ('feed-claim-cpu','compragamer','https://compragamer.com/producto/123',100,'in-stock',now()-interval '48h'),('feed-claim-cpu','mexx','https://mexx.com.ar/producto/123',100,'in-stock',now()-interval '48h'),('feed-claim-cpu','maxtecno','https://maxtecno.com.ar/producto/123',100,'in-stock',now()-interval '48h'),('feed-claim-cpu','katech','https://katech.com.ar/producto/123',100,'in-stock',now()-interval '48h');
SELECT seed_catalog_refresh_queue();
DO $$
DECLARE tok uuid:=gen_random_uuid(); competing uuid:=gen_random_uuid(); n integer;
BEGIN
 IF has_function_privilege('anon','public.claim_catalog_feed_refresh(uuid,integer)','EXECUTE') OR has_function_privilege('authenticated','public.claim_catalog_feed_refresh(uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Cola expuesta'; END IF;
 SELECT count(*) INTO n FROM claim_catalog_feed_refresh(tok,24) WHERE store_id NOT IN ('compragamer','maxtecno','katech');
 IF (SELECT count(*) FROM catalog_offer_refresh_state q JOIN product_prices p ON p.id=q.offer_id WHERE p.product_id='feed-claim-cpu' AND q.lease_token=tok) <> 3 THEN RAISE EXCEPTION 'No rota las tres fuentes compartidas'; END IF;
 IF n<>0 THEN RAISE EXCEPTION 'Reclama otra fuente'; END IF;
 IF NOT EXISTS(SELECT 1 FROM catalog_offer_refresh_state q JOIN product_prices p ON p.id=q.offer_id WHERE p.product_id='feed-claim-cpu' AND p.store_id='compragamer' AND q.lease_token=tok) THEN RAISE EXCEPTION 'No reserva oferta vencida'; END IF;
 IF EXISTS(SELECT 1 FROM claim_catalog_feed_refresh(competing,24) c JOIN product_prices p ON p.id=c.offer_id WHERE p.product_id='feed-claim-cpu') THEN RAISE EXCEPTION 'Doble reserva'; END IF;
 IF NOT EXISTS(SELECT 1 FROM claim_catalog_refresh(competing,24) c WHERE c.product_id='feed-claim-cpu' AND c.store_id='mexx') THEN RAISE EXCEPTION 'La rotación general queda bloqueada'; END IF;
END $$;
ROLLBACK;
