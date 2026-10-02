begin;
insert into public.products(id,name,category,model) values('test-inventory-product','Memoria RAM DDR4 16GB','memoria-ram','DDR4 16GB');
do $$
declare token uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); entries jsonb;
begin
 assert not has_table_privilege('anon','public.catalog_inventory_listings','select');
 assert not has_table_privilege('authenticated','public.catalog_inventory_sources','update');
 assert not has_function_privilege('anon','public.claim_catalog_inventory(text,uuid)','execute');
 assert has_function_privilege('service_role','public.claim_catalog_inventory(text,uuid)','execute');
 assert not public.claim_catalog_inventory('unknown',token);
 assert public.claim_catalog_inventory('maxtecno',token);
 assert not public.claim_catalog_inventory('maxtecno',other);
 entries:=jsonb_build_array(jsonb_build_object('source_id','123','url','https://maxtecno.com.ar/producto/old/',
  'title','Memoria RAM DDR4 16GB','product_id','test-inventory-product','last_seen_at',now()));
 assert not public.register_catalog_inventory('maxtecno',other,entries);
 assert not public.register_catalog_inventory('maxtecno',token,jsonb_build_array((entries->0)||jsonb_build_object('last_seen_at',now()-interval '1 day')));
 assert public.register_catalog_inventory('maxtecno',token,entries);
 assert public.finish_catalog_inventory('maxtecno',token,true,'{"publishedListings":1}');
 assert public.finish_catalog_inventory('maxtecno',token,true,'{"publishedListings":1}');
 assert not public.finish_catalog_inventory('maxtecno',token,false,'{"publishedListings":1}');
 assert not public.claim_catalog_inventory('maxtecno',other), 'No repetir un inventario completo antes de 24 horas';
 update public.catalog_inventory_sources set next_attempt_at='-infinity' where store_id='maxtecno';
 assert public.claim_catalog_inventory('maxtecno',other);
 assert public.register_catalog_inventory('maxtecno',other,jsonb_build_array((entries->0)||'{"url":"https://maxtecno.com.ar/producto/new/","product_id":null}'::jsonb));
 assert (select previous_url='https://maxtecno.com.ar/producto/old/' and product_id='test-inventory-product' from public.catalog_inventory_listings where store_id='maxtecno' and source_id='123');
 assert public.finish_catalog_inventory('maxtecno',other,false,'{"code":"blocked"}');
 assert (select last_scan_token=token from public.catalog_inventory_sources where store_id='maxtecno'), 'Una lectura fallida no valida inventario parcial';
 assert not exists(select 1 from public.product_prices where product_id='test-inventory-product'), 'Inventario no fabrica precios ni stock';
end $$;
do $$
declare at timestamptz:=now(); base jsonb; evidence jsonb;
begin
 evidence:='{"listingRef":"maxtecno:url:https://maxtecno.com.ar/producto/123","title":"Memoria RAM DDR4 16GB","storeSku":"local"}';
 base:=jsonb_build_object('product_id','test-inventory-product','store_id','maxtecno','url','https://maxtecno.com.ar/producto/123',
 'price',123.45,'stock','in-stock','last_updated',at,'state_signature','123.45','source_identity',evidence,'price_condition','special');
 perform public.persist_catalog_offers(jsonb_build_array(base));
 assert (select source_identity=evidence and price_condition='special' and last_updated=at from public.product_prices where product_id='test-inventory-product');
 perform public.persist_catalog_offers(jsonb_build_array(base-'source_identity'-'price_condition'));
 assert (select source_identity=evidence and price_condition='special' from public.product_prices where product_id='test-inventory-product');
 perform public.persist_catalog_offers(jsonb_build_array(base||jsonb_build_object('last_updated',at-interval '1 hour','source_identity','{"listingRef":"old","title":"Old"}'::jsonb)));
 assert (select source_identity=evidence and last_updated=at from public.product_prices where product_id='test-inventory-product');
 assert (select count(*)=1 from public.price_history where product_id='test-inventory-product');
end $$;
rollback;
