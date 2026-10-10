-- Fixtures sólo para PG local: mantener total, frecuencia, kit y frescura.
begin;
insert into public.products(id,name,category,model) values
 ('qa-ram-patriot','Memoria Patriot DDR5 32GB 2x16GB 6000MHz','memoria-ram','Patriot 32GB'),
 ('qa-ram-corsair','Memoria Corsair DDR5 32 GB (2 x 16GB) 6000 MHz','memoria-ram','Corsair 32GB'),
 ('qa-ram-single','Memoria Kingston DDR5 32GB 1x32GB 6000','memoria-ram','Kingston 32GB'),
 ('qa-ram-6400','Memoria Patriot DDR5 32GB 2x16GB 6400MHz','memoria-ram','Patriot 6400'),
 ('qa-ram-16','Memoria Corsair DDR5 16GB 2x8GB 6000MHz','memoria-ram','Corsair 16GB'),
 ('qa-ram-ddr4','Memoria Corsair DDR4 32GB 2x16GB 6000MHz','memoria-ram','Corsair DDR4'),
 ('qa-ram-old','Memoria GSkill DDR5 32GB 2x16GB 6000MHz','memoria-ram','GSkill old'),
 ('qa-ram-unknown','Memoria Adata DDR5 32GB 2x16GB 6000MHz','memoria-ram','Adata unknown');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
 select id,'mexx','https://www.mexx.com.ar/'||id,
 case id when 'qa-ram-patriot' then 100000 when 'qa-ram-corsair' then 200000 when 'qa-ram-single' then 300000 else 50000 end,
 case id when 'qa-ram-unknown' then 'unknown' else 'in-stock' end,
 case id when 'qa-ram-old' then now()-interval '4 days' else now() end
 from public.products where id like 'qa-ram-%';
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
 values ('qa-ram-corsair','venex','https://www.venex.com.ar/qa-ram-corsair',350000,'in-stock',now());

do $$
declare capacity text; speed text; kit text; result jsonb; first_page jsonb; second_page jsonb;
begin
 foreach capacity in array array['32GB','32 GB'] loop
 foreach speed in array array['6000','6000MHz','6000 MHz'] loop
  result := public.search_catalog_page(p_query=>'ddr5 '||capacity||' '||speed,p_category=>'memoria-ram',p_min_price=>0,p_sort=>'price-asc');
  assert result->>'total'='3', 'RAM unidades debe encontrar tres fichas actuales: '||capacity||' '||speed;
  assert result#>>'{products,0,id}'='qa-ram-patriot' and result#>>'{products,1,id}'='qa-ram-corsair' and result#>>'{products,2,id}'='qa-ram-single';
  foreach kit in array array['2x16','2x16GB','2 x 16GB','2x16 GB','2 x16 GB','2 x 16 GB'] loop
   result := public.search_catalog_page(p_query=>'ddr5 '||capacity||' '||kit||' '||speed,p_category=>'memoria-ram',p_min_price=>0,p_sort=>'price-desc');
   assert result->>'total'='2', 'RAM kit explícito conserva sólo 2x16: '||capacity||' '||kit||' '||speed;
   assert result#>>'{products,0,id}'='qa-ram-corsair' and result#>>'{products,1,id}'='qa-ram-patriot';
  end loop;
 end loop; end loop;
 result := public.search_catalog_page(p_query=>'ddr5',p_category=>'memoria-ram',p_min_price=>0);
 assert result->>'total'='5', 'Consulta general no incorpora restricciones de frecuencia/kit';
 result := public.search_catalog_page(p_query=>'ddr5 32gb',p_category=>'memoria-ram',p_min_price=>0);
 assert result->>'total'='4', 'Una capacidad sin frecuencia no inventa MHz';
 result := public.search_catalog_page(p_query=>'ddr5 32 GB 2 x 16GB 6200 MHz',p_category=>'memoria-ram',p_min_price=>0);
 assert result->>'total'='0', 'No relajar frecuencia ausente';
 result := public.search_catalog_page(p_query=>'ddr5 32gb 2x8 6000',p_category=>'memoria-ram',p_min_price=>0);
 assert result->>'total'='0', '32GB/2x16 no equivale a 16GB/2x8';
 result := public.search_catalog_page(p_query=>'ddr5 32gb 1x32 6000',p_category=>'memoria-ram',p_min_price=>0);
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-ram-single', '1x32 no equivale a 2x16';
 first_page := public.search_catalog_page(p_query=>'ddr5 32 GB 2 x16GB 6000 MHz',p_category=>'memoria-ram',p_min_price=>0,p_sort=>'price-asc',p_page_size=>1);
 second_page := public.search_catalog_page(p_query=>'ddr5 32 GB 2 x16GB 6000 MHz',p_category=>'memoria-ram',p_min_price=>0,p_sort=>'price-asc',p_page_size=>1,p_page=>2);
 assert first_page->>'total'='2' and first_page->>'totalPages'='2' and second_page->>'page'='2';
 assert first_page#>>'{products,0,id}'='qa-ram-patriot' and second_page#>>'{products,0,id}'='qa-ram-corsair', 'Equivalencia antes del total y límite';
 result := public.search_catalog_page(p_query=>'ddr5 32 GB 2x16 6000',p_category=>'memoria-ram',p_min_price=>0,p_stores=>array['venex']);
 assert result->>'total'='1' and (result#>>'{products,0,lowest_price}')::numeric=350000;
 result := public.search_catalog_page(p_query=>'ddr5 32gb 2x16gb 6000',p_category=>'memoria-ram',p_min_price=>0,p_max_price=>150000);
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-ram-patriot';
 assert not public.catalog_matches_query('Fuente Corsair 6000MHz','fuente corsair 6000mhz','6000',''), 'No reinterpretar bare6000 fuera de RAM';
 assert public.catalog_matches_query('Memoria DDR5 32 GB (2 x 16GB) 6000 MHz',
  public.catalog_search_text('Memoria DDR5 32 GB (2 x 16GB) 6000 MHz'),'ddr5 32gb 2x16gb 6000',''), 'Matcher directo conserva la equivalencia RAM';
 assert not public.catalog_matches_query('RAM DDR5 32GB 4x8GB 6000MHz',
  'ram ddr5 32gb 4x8gb 6000mhz 2x16gb','ddr5 32gb 2x16 6000',''), 'Kit en metadata no reemplaza el kit del título';
 assert not public.catalog_matches_query('RAM DDR5 32GB 2x16GB 6400MHz',
  'ram ddr5 32gb 2x16gb 6400mhz 6000mhz','ddr5 32gb 2x16 6000',''), 'Frecuencia en metadata no reemplaza la frecuencia del título';
end $$;
insert into public.products(id,name,category,model) values
 ('qa-context-cpu','Procesador AMD Ryzen 5 5600 compatible DDR4','procesadores','Ryzen 5600'),
 ('qa-context-cpu-x','Procesador AMD Ryzen 5 5600X compatible DDR4','procesadores','Ryzen 5600X'),
 ('qa-context-mother','Motherboard ASUS B650 DDR5 6000MHz','motherboards','B650'),
 ('qa-context-gpu','Placa de video MSI RTX 4070 DDR5 6000MHz','tarjetas-graficas','RTX 4070');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
 select id,'mexx','https://www.mexx.com.ar/'||id,100000,'in-stock',now()
 from public.products where id like 'qa-context-%';
do $$
declare result jsonb;
begin
 result := public.search_catalog_page(p_query=>'Ryzen 5600 DDR4',p_category=>'procesadores',p_min_price=>0);
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-context-cpu', 'Compatibilidad DDR no elimina la firma CPU';
 result := public.search_catalog_page(p_query=>'Ryzen 5600 DDR4',p_min_price=>0);
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-context-cpu', 'Inferencia RAM no reemplaza una firma CPU';
 result := public.search_catalog_page(p_query=>'B650 DDR5 6000',p_category=>'motherboards',p_min_price=>0);
 assert result->>'total'='0', 'Categoría motherboard conserva tokens sin reinterpretar MHz';
 result := public.search_catalog_page(p_query=>'RTX 4070 DDR5 6000',p_category=>'tarjetas-graficas',p_min_price=>0);
 assert result->>'total'='0', 'Categoría GPU conserva tokens sin reinterpretar MHz';
 result := public.search_catalog_page(p_query=>'ddr5 32 GB 2 x 16 GB 6000 MHz',p_min_price=>0);
 assert result->>'total'='2', 'Sin categoría se infiere RAM sólo sin otra firma primaria';
end $$;
rollback;
