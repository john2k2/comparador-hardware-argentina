-- Regresión: las lecturas específicas deben poder guardarse sin perder condiciones de pago.
BEGIN;
INSERT INTO public.stores(id,name,url)
 SELECT sid,sid,'https://' || sid || '.example'
 FROM unnest(ARRAY['compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','maximus','katech']) sid
 ON CONFLICT(id) DO NOTHING;
INSERT INTO public.products(id,name,model,category) VALUES ('payment-test-product','Procesador Ryzen 7600','7600','procesadores');
DO $$
DECLARE sid text; target uuid; tok uuid:=gen_random_uuid(); observed timestamptz:=clock_timestamp(); evidence jsonb;
BEGIN
 FOR sid IN SELECT unnest(ARRAY['compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','maximus','katech']) LOOP
  INSERT INTO public.product_prices(product_id,store_id,url,price,stock,last_updated)
   VALUES ('payment-test-product',sid,'https://example.com/payment-test',100,'out-of-stock',now()-interval '3 days') RETURNING id INTO target;
  INSERT INTO public.catalog_offer_refresh_state(offer_id,category,lease_token,leased_until) VALUES (target,'procesadores',tok,now()+interval '20 minutes')
   ON CONFLICT(offer_id) DO UPDATE SET category=excluded.category,lease_token=excluded.lease_token,leased_until=excluded.leased_until;
  evidence:=jsonb_build_object('listingRef',sid||':url:https://example.com/payment-test','title','Procesador Ryzen 7600');
  IF persist_adaptive_offer(target,tok,1,NULL,'in-stock',NULL,NULL,now(),observed,NULL,'template',jsonb_set(evidence,'{title}','"§ITEMTIT§"'),'special') THEN RAISE EXCEPTION 'Acepta plantilla no resuelta'; END IF;
  IF persist_adaptive_offer(target,gen_random_uuid(),200,NULL,'unknown',NULL,NULL,now(),observed,NULL,'payment',evidence,'special') THEN RAISE EXCEPTION 'Acepta token incorrecto'; END IF;
  IF sid='katech' THEN
   IF persist_adaptive_offer(target,tok,200,NULL,'unknown',NULL,NULL,now(),observed,NULL,'payment',evidence,'special') THEN RAISE EXCEPTION 'Amplió condiciones a una fuente sin constatación'; END IF;
  ELSE
   IF NOT persist_adaptive_offer(target,tok,200,NULL,'unknown',NULL,NULL,now(),observed,NULL,'payment',evidence,'special') THEN RAISE EXCEPTION 'Rechaza condición constatada: %',sid; END IF;
   IF NOT EXISTS (SELECT 1 FROM product_prices WHERE id=target AND price=200 AND stock='unknown' AND last_updated=observed AND price_condition='special') THEN RAISE EXCEPTION 'Modificó datos de observación: %',sid; END IF;
   IF persist_adaptive_offer(target,tok,300,NULL,'in-stock',NULL,NULL,now(),now()+interval '2 minutes',NULL,'payment',evidence,'special') THEN RAISE EXCEPTION 'Acepta fecha futura'; END IF;
  END IF;
  IF NOT finish_catalog_refresh(target,tok,'observed') THEN RAISE EXCEPTION 'No libera reserva'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM price_history WHERE product_id='payment-test-product') <> 8 THEN RAISE EXCEPTION 'Historial incorrecto'; END IF;
 IF has_function_privilege('anon','public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Amplió permisos públicos'; END IF;
END $$;
ROLLBACK;
