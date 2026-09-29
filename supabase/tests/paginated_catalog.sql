-- PostgreSQL LOCAL UTF8 con las migraciones. psql -v ON_ERROR_STOP=1 -f ...
begin;

insert into public.products(id,name,category,brand,model,updated_at)
select 'agrupado-audit-' || i, 'Auditcatalog item ' || lpad(i::text,4,'0'),
  'perifericos','Auditcatalog','item ' || i, now()-i*interval '1 minute'
from generate_series(1,1501) i;
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
select 'agrupado-audit-' || i,'mexx','https://example.invalid/audit/' || i,
  case when i=1501 then 100 else 100000+i end,'in-stock',now()
from generate_series(1,1501) i;

do $$
declare result jsonb; visited integer := 0; ids text[] := '{}'; number integer; page_item jsonb;
begin
  result := public.search_catalog_page(p_query=>'auditcatalog',p_sort=>'price-asc');
  assert (result->>'total')::int=1501;
  assert result#>>'{products,0,id}'='agrupado-audit-1501', 'El mínimo real no depende de las 1000 filas más recientes';
  assert jsonb_array_length(result->'products')=12;

  result := public.search_catalog_page(p_query=>'auditcatalog',p_sort=>'newest',p_page=>2,p_page_size=>48);
  assert result#>>'{products,1,id}'='agrupado-audit-50';
  assert (result->>'total')::int=1501 and (result->>'totalPages')::int=32;
  for number in 1..32 loop
    result := public.search_catalog_page(p_query=>'auditcatalog',p_sort=>'newest',p_page=>number,p_page_size=>48);
    for page_item in select value from jsonb_array_elements(result->'products') loop
      assert not (page_item->>'id'=any(ids)), 'Las páginas no deben repetirse';
      ids := array_append(ids,page_item->>'id'); visited:=visited+1;
    end loop;
  end loop;
  assert visited=1501, 'El recorrido debe cubrir todo el catálogo';
  result := public.search_catalog_page(p_query=>'auditcatalog',p_page=>999,p_page_size=>48);
  assert (result->>'page')::int=32 and jsonb_array_length(result->'products')=13;
  result := public.search_catalog_page(p_query=>'no-such-audit-result',p_page=>999);
  assert (result->>'page')::int=1 and (result->>'total')::int=0 and (result->>'totalPages')::int=0;
end $$;

-- Los filtros se calculan sobre el precio de las tiendas seleccionadas.
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
values ('agrupado-audit-50','venex','https://example.invalid/venex/50',300000,'in-stock',now());
do $$
declare result jsonb;
begin
  result := public.search_catalog_page(p_query=>'auditcatalog',p_stores=>array['venex']);
  assert (result->>'total')::int=1 and (result#>>'{products,0,lowest_price}')::numeric=300000;
  result := public.search_catalog_page(p_query=>'auditcatalog',p_stores=>array['venex'],p_max_price=>200000);
  assert (result->>'total')::int=0;
end $$;

-- Se prefiere la ficha persistida agrupada, sin inventar ofertas de otro ID.
insert into public.products(id,name,category,model)
values ('audit-original','Auditcatalog item 0050','perifericos','0050'),
  ('audit-only-original','Auditcatalog standalone','perifericos','standalone');
insert into public.product_prices(product_id,store_id,url,price,stock)
values ('audit-original','mexx','https://example.invalid/original',1,'in-stock'),
  ('audit-only-original','mexx','https://example.invalid/standalone',500,'in-stock');
do $$
declare result jsonb;
begin
  result := public.search_catalog_page(p_query=>'auditcatalog item 0050');
  assert (result->>'total')::int=1 and result#>>'{products,0,id}'='agrupado-audit-50';
  assert (result#>>'{products,0,lowest_price}')::numeric=100050;
  result := public.search_catalog_page(p_query=>'auditcatalog standalone');
  assert (result->>'total')::int=1 and result#>>'{products,0,id}'='audit-only-original';
end $$;

-- Paridad de intención: sufijos, familias, marketing contradictorio y SODIMM.
do $$
begin
  assert public.catalog_search_text('Pláca de vídeo RTX 5070')='gpu rtx 5070';
  assert public.catalog_chip('MSI RTX 4070 TI S OC','gpu')=array['rtx','4070','ti super'];
  assert public.catalog_chip('AMD Ryzen 5 5600XT mejor que 5600X','cpu')=array['ryzen5','5600','xt'];
  assert not public.catalog_matches_query('AMD Ryzen 5 5600XT mejor que 5600X',public.catalog_search_text('AMD Ryzen 5 5600XT mejor que 5600X'),'ryzen 5600x','');
  assert not public.catalog_matches_query('MSI RTX 4070 Ti Super',public.catalog_search_text('MSI RTX 4070 Ti Super'),'rtx 4070 ti','');
  assert public.catalog_matches_query('MSI RTX 4070 Ti Super',public.catalog_search_text('MSI RTX 4070 Ti Super'),'rtx 4070 ti super','');
  assert not public.catalog_matches_query('Memoria DDR5 32GB',public.catalog_search_text('Memoria DDR5 32GB'),'ddr5 32gb','https://example.invalid/sodimm-ddr5');
  assert public.catalog_matches_query('Mouse Logitech G502 X',public.catalog_search_text('Mouse Logitech G502 X'),'g502 x','');
  assert not public.catalog_matches_query('Mouse Logitech G502 Hero',public.catalog_search_text('Mouse Logitech G502 Hero'),'g502 x','');
  assert not public.catalog_standalone('PC Gamer Ryzen 5600 RTX 4060','procesadores');
  assert public.catalog_standalone('Kingston DDR5 32GB kit 2x16','memoria-ram');
end $$;

-- Outliers por tienda y ofertas agotadas no alteran el mínimo disponible.
insert into public.products(id,name,category,model)
values ('audit-outlier','Auditoutlier mouse','perifericos','mouse');
insert into public.product_prices(product_id,store_id,url,price,stock)
values ('audit-outlier','mexx','https://example.invalid/m1',100000,'in-stock'),
  ('audit-outlier','mexx','https://example.invalid/m2',50000,'out-of-stock'),
  ('audit-outlier','venex','https://example.invalid/v1',500000,'in-stock'),
  ('audit-outlier','fullh4rd','https://example.invalid/f1',1000,'out-of-stock');
do $$
declare result jsonb;
begin
  result := public.search_catalog_page(p_query=>'auditoutlier');
  assert (result#>>'{products,0,lowest_price}')::numeric=100000;
  assert (result#>>'{products,0,highest_price}')::numeric=100000;
  assert jsonb_array_length(result#>'{products,0,product_prices}')=2;
  assert not public.catalog_matches_query('MSI RTX 5060 Ventus','msi rtx 5060 ventus shadow','msi shadow 5060','');
end $$;

-- Invoker: el lector público no necesita service_role ni privilegios de escritura.
grant select on public.products,public.product_prices to anon;
set local role anon;
select public.search_catalog_page(p_query=>'auditcatalog',p_page_size=>1)->>'total' as public_total;
reset role;
rollback;
