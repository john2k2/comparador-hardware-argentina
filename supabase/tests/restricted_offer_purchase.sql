begin;
insert into public.products(id,name,category,model) values ('audit-restricted','AMD Ryzen 5 5600','procesadores','5600');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated,source_identity) values
 ('audit-restricted','compragamer','https://compragamer.com/producto/Procesador_AMD_Ryzen_5_5600_1',100000,'in-stock',now()-interval '10 minutes',
  '{"listingRef":"compragamer:id:1","title":"AMD Ryzen 5 5600","sourceId":"1"}'),
 ('audit-restricted','mexx','https://www.mexx.com.ar/producto/amd-ryzen-5-5600',150000,'in-stock',now()-interval '10 minutes',null);
do $$
declare source jsonb; restricted jsonb; review jsonb; restriction text; old_row jsonb; result jsonb; invalid jsonb; malformed jsonb;
 url text:='https://compragamer.com/producto/Procesador_AMD_Ryzen_5_5600_1';
begin
 source:='{"listingRef":"compragamer:id:1","title":"AMD Ryzen 5 5600","sourceId":"1"}';
 review:=jsonb_build_object('version',1,'status','consistent','reason','exact-attributes','model',null,'confidence',null,
  'reviewedAt',now(),'sourceIdentity',source,'proof',jsonb_build_object('version',1,'method','exact-attributes',
  'attributes',public.catalog_exact_offer_attributes('AMD Ryzen 5 5600','procesadores')),
  'subject',jsonb_build_object('name','amd ryzen 5 5600','category','procesadores','url',url));
 assert public.catalog_offer_is_comparable(100000,'in-stock',url,review,'AMD Ryzen 5 5600','procesadores',source,'compragamer');
 assert public.catalog_offer_is_comparable(100000,'in-stock',url,review,'AMD Ryzen 5 5600','procesadores',null,'compragamer'), 'Ausencia permite fuente legacy válida';
 foreach restriction in array array['build-only','combo-only'] loop
  restricted:=source||jsonb_build_object('purchaseRestriction',restriction);
  assert not public.catalog_offer_is_comparable(100000,'in-stock',url,null,'AMD Ryzen 5 5600','procesadores',restricted,'compragamer'), 'Restricted individual purchase must be rejected';
  assert not public.catalog_offer_is_comparable(100000,'low-stock',url,review||jsonb_build_object('sourceIdentity',restricted),'AMD Ryzen 5 5600','procesadores',restricted,'compragamer'), 'Exact proof cannot override purchase restriction';
  assert not public.catalog_offer_is_comparable(100000,'in-stock',url,review||jsonb_build_object('sourceIdentity',restricted),'AMD Ryzen 5 5600','procesadores',null,'compragamer'), 'Legacy review source restriction must be rejected';
  assert not public.catalog_offer_is_comparable(100000,'in-stock',url,review||jsonb_build_object('sourceIdentity',restricted),'AMD Ryzen 5 5600','procesadores',source,'compragamer'), 'Explicit review restriction remains excluded';
  select to_jsonb(p)-'source_identity' into old_row from public.product_prices p where product_id='audit-restricted' and store_id='compragamer';
  update public.product_prices set source_identity=restricted where product_id='audit-restricted' and store_id='compragamer';
  assert (select to_jsonb(p)-'source_identity' from public.product_prices p where product_id='audit-restricted' and store_id='compragamer')=old_row, 'Metadata does not renew price, stock or observation';
  result:=public.search_catalog_page(p_query=>'ryzen 5600',p_sort=>'price-asc');
  assert result#>>'{products,0,id}'='audit-restricted';
  assert (result#>>'{products,0,lowest_price}')::numeric=150000, 'Minimum excludes restricted offer';
  assert jsonb_array_length(result#>'{products,0,product_prices}')=2, 'Inspection retains original observations';
  assert (public.search_catalog_page(p_query=>'ryzen 5600',p_max_price=>120000)->>'total')::int=0, 'Max filter excludes restricted cheap price';
  assert (public.search_catalog_page(p_query=>'ryzen 5600',p_stores=>array['compragamer'],p_min_price=>0)->>'total')::int=0;
 end loop;
 for invalid in select value from jsonb_array_elements('[null,"unknown",34,true,[],{}]'::jsonb) loop
  malformed:=source||jsonb_build_object('purchaseRestriction',invalid);
  assert not public.catalog_offer_is_comparable(100000,'in-stock',url,review,'AMD Ryzen 5 5600','procesadores',malformed,'compragamer'), 'Metadata malformada en fuente principal se rechaza';
  assert not public.catalog_offer_is_comparable(100000,'in-stock',url,review||jsonb_build_object('sourceIdentity',malformed),'AMD Ryzen 5 5600','procesadores',source,'compragamer'), 'Metadata malformada en review se rechaza aun con fuente principal válida';
  assert not public.catalog_offer_is_comparable(100000,'in-stock',url,review||jsonb_build_object('sourceIdentity',malformed),'AMD Ryzen 5 5600','procesadores',null,'compragamer'), 'Metadata malformada en fuente legacy se rechaza';
 end loop;
 update public.product_prices set stock='unknown' where product_id='audit-restricted' and store_id='mexx';
 assert (public.search_catalog_page(p_query=>'ryzen 5600',p_min_price=>0)->>'total')::int=0, 'No alternativa comprable implica cero resultados actuales';
 assert not public.catalog_offer_is_comparable(100000,'in-stock',url,null,'AMD Ryzen 5 5600','procesadores',source||'{"purchaseRestriction":"unknown"}','compragamer');
 assert not public.catalog_offer_is_comparable(100000,'in-stock',url,null,'AMD Ryzen 5 5600','procesadores',source||'{"purchaseRestriction":null}','compragamer');
 assert not public.catalog_offer_is_comparable(100000,'unknown',url,null,'AMD Ryzen 5 5600','procesadores',source,'compragamer');
 assert not public.catalog_offer_is_comparable(100000,'in-stock',url||'?token=x',null,'AMD Ryzen 5 5600','procesadores',source,'compragamer');
 assert not public.catalog_offer_is_comparable(100000,'in-stock',url,null,'AMD Ryzen 5 5600','procesadores',source||'{"title":"AMD Ryzen 5 5600G"}','compragamer');
 assert has_function_privilege('anon','public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text)','EXECUTE');
end $$;
set local role anon;
do $$ begin
 assert not public.catalog_offer_is_comparable(100000,'in-stock','https://compragamer.com/producto/Procesador_AMD_Ryzen_5_5600_1',
  null,'AMD Ryzen 5 5600','procesadores','{"listingRef":"compragamer:id:1","title":"AMD Ryzen 5 5600","sourceId":"1","purchaseRestriction":"build-only"}','compragamer');
end $$;
reset role;
rollback;
