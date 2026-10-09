-- Sólo fixtures locales, sin cambiar observaciones del catálogo real.
begin;
insert into public.products(id,name,category,model) values
 ('qa-numeric-3050-6','MSI GeForce RTX 3050 Ventus 6GB','tarjetas-graficas','RTX 3050 6GB'),
 ('qa-numeric-3050-8','ASUS GeForce RTX 3050 Dual 8GB','tarjetas-graficas','RTX 3050 8GB'),
 ('qa-numeric-9060','ASRock Radeon RX 9060 XT 16GB','tarjetas-graficas','RX 9060 XT 16GB'),
 ('qa-numeric-rx7600','Sapphire Radeon RX 7600 8GB','tarjetas-graficas','RX 7600 8GB'),
 ('qa-numeric-ryzen7600','AMD Ryzen 5 7600','procesadores','Ryzen 5 7600'),
 ('qa-numeric-4070ti','MSI RTX 4070 Ti 12GB','tarjetas-graficas','RTX 4070 Ti'),
 ('qa-numeric-4070super','MSI RTX 4070 Ti Super 16GB','tarjetas-graficas','RTX 4070 Ti Super'),
 ('qa-numeric-cooler','Watercooler Corsair TITAN 3050 RX RGB','refrigeracion','TITAN 3050');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
 select id,'mexx','https://www.mexx.com.ar/product/'||lower(replace(name,' ','-')),100000,'in-stock',now()
 from public.products where id like 'qa-numeric-%';
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
 values ('qa-numeric-3050-6','venex','https://www.venex.com.ar/msi-rtx-3050-6gb',200000,'in-stock',now());

do $$
declare result jsonb; second jsonb;
begin
 result := public.search_catalog_page(p_query=>'3050',p_category=>'tarjetas-graficas');
 assert result->>'total'='2', 'Número GPU no debe recibir firma CPU';
 assert jsonb_array_length(result->'products')=2, '6GB y 8GB siguen siendo identidades separadas';
 result := public.search_catalog_page(p_query=>'9060',p_category=>'tarjetas-graficas');
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-numeric-9060', 'No inventar prefijo RTX para Radeon';
 result := public.search_catalog_page(p_query=>'7600');
 assert result->>'total'='2', 'Consulta ambigua puede encontrar CPU y GPU';
 result := public.search_catalog_page(p_query=>'7600',p_category=>'procesadores');
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-numeric-ryzen7600', 'Categoría CPU explícita conserva su intención';
 result := public.search_catalog_page(p_query=>'7600',p_category=>'tarjetas-graficas');
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-numeric-rx7600';
 result := public.search_catalog_page(p_query=>'3050',p_category=>'procesadores');
 assert result->>'total'='0', 'No cruzar la categoría explícita';
 result := public.search_catalog_page(p_query=>'RTX 4070 Ti',p_category=>'tarjetas-graficas');
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-numeric-4070ti', 'Ti y Ti Super no se mezclan';
 result := public.search_catalog_page(p_query=>'RTX 4070 Ti Super',p_category=>'tarjetas-graficas');
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-numeric-4070super';
 result := public.search_catalog_page(p_query=>'RTX 3050 6GB',p_category=>'tarjetas-graficas');
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-numeric-3050-6';
 result := public.search_catalog_page(p_query=>'3050',p_category=>'tarjetas-graficas',p_stores=>array['venex']);
 assert result->>'total'='1' and (result#>>'{products,0,lowest_price}')::numeric=200000, 'El precio corresponde a la tienda elegida';
 result := public.search_catalog_page(p_query=>'3050',p_category=>'tarjetas-graficas',p_stores=>array['venex'],p_max_price=>150000);
 assert result->>'total'='0', 'El rango no toma el precio de otra tienda';
 result := public.search_catalog_page(p_query=>'3050',p_category=>'tarjetas-graficas',p_page_size=>1,p_page=>1,p_sort=>'price-asc');
 second := public.search_catalog_page(p_query=>'3050',p_category=>'tarjetas-graficas',p_page_size=>1,p_page=>2,p_sort=>'price-asc');
 assert result->>'totalPages'='2' and second->>'page'='2';
 assert result#>>'{products,0,id}'<>second#>>'{products,0,id}', 'Páginas sin duplicación';
 result := public.search_catalog_page(p_query=>'93050',p_category=>'tarjetas-graficas');
 assert result->>'total'='0', 'El número completo continúa siendo obligatorio';
end $$;
rollback;
