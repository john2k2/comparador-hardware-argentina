begin;
insert into public.products(id,name,category,model) values ('audit-current-evidence','AMD Ryzen 5 5600','procesadores','5600');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated) values
 ('audit-current-evidence','mexx','https://www.mexx.com.ar/producto/cpu-historico',100000,'in-stock',now()-interval '48 hours'),
 ('audit-current-evidence','mexx','https://www.mexx.com.ar/producto/cpu-unknown',90000,'unknown',now()),
 ('audit-current-evidence','mexx','https://www.mexx.com.ar/producto/cpu-actual',210000,'in-stock',now()),
 ('audit-current-evidence','venex','https://www.venex.com.ar/producto/cpu-actual',220000,'in-stock',now());
do $$
declare result jsonb; source jsonb; attrs jsonb; review jsonb; old_date timestamptz;
begin
 result:=public.search_catalog_page(p_query=>'ryzen 5600',p_sort=>'price-asc');
 assert result#>>'{products,0,id}'='audit-current-evidence';
 assert (result#>>'{products,0,lowest_price}')::numeric=210000, 'El mínimo actual excluye barato viejo/stock desconocido';
 assert jsonb_array_length(result#>'{products,0,product_prices}')=4, 'Preservar alternativas para inspección';
 assert (public.search_catalog_page(p_query=>'ryzen 5600',p_max_price=>200000)->>'total')::int=0;
 assert (public.search_catalog_page(p_query=>'ryzen 5600',p_stores=>array['venex'])#>>'{products,0,lowest_price}')::numeric=220000;
 -- Simular el paso del reloj sin tocar los timestamps de la tabla fuente.
 update public.catalog_price_summaries set comparable_valid_until=now()-interval '1 second',
  comparable_latest_observed_at=now()-interval '25 hours',
  comparable_offers=(select jsonb_agg(offer||jsonb_build_object('last_updated',now()-interval '25 hours')) from jsonb_array_elements(comparable_offers) offer)
 where product_id='audit-current-evidence';
 assert (public.search_catalog_page(p_query=>'ryzen 5600',p_max_price=>250000)->>'total')::int=0, 'El caché vencido no sostiene un precio comprable';
 perform public.sync_catalog_comparable_summary('audit-current-evidence');
 assert (select lowest from public.catalog_current_price_stats('[{"id":"00000000-0000-0000-0000-000000000001","store_id":"mexx","price":1,"stock":"in-stock","url":"https://www.mexx.com.ar/item","last_updated":"2000-01-01T00:00:00Z"}]')) is null, 'Vencimiento no requiere otra escritura';
 source:=jsonb_build_object('title','AMD Ryzen 5 5600','listingRef','mexx:id:1','sourceId','1');
 attrs:=public.catalog_exact_offer_attributes('AMD Ryzen 5 5600','procesadores');
 review:=jsonb_build_object('version',1,'status','consistent','reason','exact-attributes','model',null,'confidence',null,
  'reviewedAt',now(),'sourceIdentity',source,'proof',jsonb_build_object('version',1,'method','exact-attributes','attributes',attrs),
  'subject',jsonb_build_object('name','amd ryzen 5 5600','category','procesadores','url','https://www.mexx.com.ar/producto/cpu-actual'));
 assert public.catalog_offer_is_comparable(100,'in-stock','https://www.mexx.com.ar/producto/cpu-actual',review,'AMD Ryzen 5 5600','procesadores',source,'mexx');
 assert not public.catalog_offer_is_comparable(100,'in-stock','https://www.mexx.com.ar/producto/cpu-actual',review,'AMD Ryzen 5 5600','procesadores',source||'{"title":"AMD Ryzen 5 5600G"}','mexx');
 assert not public.catalog_offer_is_comparable(100,'in-stock','https://other.invalid/producto/cpu-actual',null,'AMD Ryzen 5 5600','procesadores',source,'mexx');
 assert not public.catalog_offer_is_comparable(100,'in-stock','https://www.mexx.com.ar/producto/cpu-actual?token=x',null,'AMD Ryzen 5 5600','procesadores',source,'mexx');
 assert not public.catalog_offer_is_comparable(100,'in-stock','https://www.mexx.com.ar/producto/cpu-actual',null,'AMD Ryzen 5 5600','procesadores','{"title":34}','mexx');
 assert public.catalog_explicit_offer_conflict('Corsair Vengeance RS 16GB DDR4 3200 MHz RGB','memoria-ram','Corsair Vengeance LPX 16GB DDR4 3200 MHz');
 assert public.catalog_explicit_offer_conflict('Kingston Fury Beast RGB 16GB DDR4 3200MHz','memoria-ram','Kingston Fury Beast RGB 16GB DDR4 3600MHz');
 assert public.catalog_exact_offer_attributes('Gigabyte RTX 5060 Eagle OC 8GB','tarjetas-graficas')<>public.catalog_exact_offer_attributes('Gigabyte RTX 5060 Eagle OC ICE 8GB','tarjetas-graficas'), 'ICE no es una equivalencia exacta';
 assert public.catalog_explicit_offer_conflict('RTX 5060 8GB','tarjetas-graficas','RTX 5060 16GB');
 select last_updated into old_date from public.product_prices where product_id='audit-current-evidence' and url=review#>>'{subject,url}';
 assert not public.persist_verified_priority_offer('audit-current-evidence','mexx',review#>>'{subject,url}',1,null,'in-stock',null,null,now(),now(),review,'bad',source||'{"title":"AMD Ryzen 5 5600G"}','unspecified');
 assert (select last_updated from public.product_prices where product_id='audit-current-evidence' and url=review#>>'{subject,url}')=old_date;
 assert public.persist_verified_priority_offer('audit-current-evidence','mexx',review#>>'{subject,url}',210000,null,'in-stock',null,null,now(),now(),review,'good',source,'unspecified');
 assert (select source_identity from public.product_prices where product_id='audit-current-evidence' and url=review#>>'{subject,url}')=source;
 assert not has_function_privilege('anon','public.persist_verified_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text)','EXECUTE');
 assert not has_function_privilege('authenticated','public.sync_catalog_comparable_summary(text)','EXECUTE');
end $$;
grant select on public.products,public.product_prices to anon;
set local role anon;
select public.search_catalog_page(p_query=>'ryzen 5600')->>'total';
reset role;
rollback;
