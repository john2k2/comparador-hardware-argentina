BEGIN;
INSERT INTO stores(id,name,url) VALUES ('completion-store','Completion','https://completion.example');
INSERT INTO products(id,name,model,category) VALUES ('completion-product','Ryzen 7600','7600','procesadores');
DO $$
DECLARE target uuid; tok uuid:=gen_random_uuid(); original_attempt timestamptz;
BEGIN
 INSERT INTO product_prices(product_id,store_id,url,price,stock) VALUES ('completion-product','completion-store','https://completion.example/cpu',100,'unknown') RETURNING id INTO target;
 INSERT INTO catalog_offer_refresh_state(offer_id,category,lease_token,leased_until) VALUES(target,'procesadores',tok,now()+interval '20 minutes')
 ON CONFLICT(offer_id) DO UPDATE SET category=excluded.category,lease_token=excluded.lease_token,leased_until=excluded.leased_until;
 IF NOT finish_catalog_refresh(target,tok,'no-observation') THEN RAISE EXCEPTION 'No termina'; END IF;
 SELECT last_attempt_at INTO original_attempt FROM catalog_offer_refresh_state WHERE offer_id=target;
 IF NOT finish_catalog_refresh(target,tok,'no-observation') THEN RAISE EXCEPTION 'Respuesta perdida no recuperable'; END IF;
 IF (SELECT failures FROM catalog_offer_refresh_state WHERE offer_id=target) <> 1 THEN RAISE EXCEPTION 'Duplica backoff'; END IF;
 IF (SELECT last_attempt_at FROM catalog_offer_refresh_state WHERE offer_id=target) <> original_attempt THEN RAISE EXCEPTION 'Renueva fecha al repetir'; END IF;
 IF finish_catalog_refresh(target,tok,'observed') OR finish_catalog_refresh(target,gen_random_uuid(),'no-observation') THEN RAISE EXCEPTION 'Acepta confirmación ajena'; END IF;
END $$;
ROLLBACK;
