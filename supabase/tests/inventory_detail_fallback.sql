begin;
insert into public.products(id,name,category,model) values('test-detail-product','Memoria RAM DDR4 16GB','memoria-ram','DDR4 16GB');
do $$
declare scan uuid:=gen_random_uuid(); detail uuid:=gen_random_uuid(); competing uuid:=gen_random_uuid(); n integer;
begin
 assert not has_function_privilege('anon','public.claim_catalog_inventory_details(uuid,integer)','execute');
 assert public.claim_catalog_inventory('katech',scan);
 assert public.register_catalog_inventory('katech',scan,jsonb_build_array(
 jsonb_build_object('source_id','321','url','https://katech.com.ar/producto/test-detail/','title','Memoria RAM DDR4 16GB','last_seen_at',now()),
 jsonb_build_object('source_id','322','url','https://www.katech.com.ar/producto/already-saved/','title','Memoria RAM DDR4 16GB','last_seen_at',now())));
 assert public.finish_catalog_inventory('katech',scan,true,'{"publishedListings":2}');
 perform public.persist_catalog_offers(jsonb_build_array(jsonb_build_object('product_id','test-detail-product','store_id','katech',
 'url','https://katech.com.ar/producto/already-saved','price',100,'stock','in-stock','last_updated',now(),'state_signature','100')));
 select count(*) into n from public.claim_catalog_inventory_details(detail,48);
 assert n=1, 'Una publicación ya representada no crea otro producto aunque falte enlace único en el registro';
 select count(*) into n from public.claim_catalog_inventory_details(competing,48);
 assert n=0, 'No reserva dos veces la misma ficha';
 assert not public.finish_catalog_inventory_detail('katech','321',detail,'test-detail-product'), 'No confirma importación sin precio realmente guardado';
 perform public.persist_catalog_offers(jsonb_build_array(jsonb_build_object('product_id','test-detail-product','store_id','katech',
 'url','https://katech.com.ar/producto/test-detail/','price',574710,'stock','in-stock','last_updated',now(),'state_signature','574710')));
 assert public.finish_catalog_inventory_detail('katech','321',detail,'test-detail-product');
 assert public.finish_catalog_inventory_detail('katech','321',detail,'test-detail-product'), 'Repetir confirmación no duplica efectos';
 assert not public.finish_catalog_inventory_detail('katech','321',competing,'test-detail-product');
 assert (select product_id='test-detail-product' from public.catalog_inventory_listings where store_id='katech' and source_id='321');
end $$;
rollback;
