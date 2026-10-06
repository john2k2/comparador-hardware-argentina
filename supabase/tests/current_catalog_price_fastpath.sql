-- Ejecutar con scripts/test-current-catalog-prices.mjs, sólo en PostgreSQL local.
-- Comparar el JSON completo con la versión anterior conserva IDs, total y orden.
begin;
insert into public.products(id,name,model,category,last_scraped_at)
select 'test-fastpath-'||n,'Mouse optico Fastpath '||n,'Fastpath '||n,'perifericos',now()
from generate_series(1,360) n;
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
select id,'mexx','https://www.mexx.com.ar/producto/'||id,100000+substring(id from '[0-9]+$')::int*100,
  'in-stock',now()-case when substring(id from '[0-9]+$')::int%4=0 then interval '25 hours' else interval '1 hour' end
from public.products where id like 'test-fastpath-%';

-- La ficha agrupada vencida sigue ganando la identidad: no escoger la copia
-- reciente para inventar disponibilidad del producto canónico.
insert into public.products(id,name,model,category,last_scraped_at) values
('agrupado-fastpath-expired','Mouse canonico Fastpath','Canonico','perifericos',now()-interval '2 days'),
('test-fastpath-copy','Mouse canonico Fastpath','Canonico','perifericos',now()),
('test-fastpath-mixed','Mouse precios Fastpath','Precios','perifericos',now()),
('test-fastpath-future','Mouse futuro Fastpath','Futuro','perifericos',now()),
('test-fastpath-unknown','Mouse incierto Fastpath','Incierto','perifericos',now());
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated) values
('agrupado-fastpath-expired','mexx','https://www.mexx.com.ar/producto/canonical',100001,'in-stock',now()-interval '25 hours'),
('test-fastpath-copy','venex','https://www.venex.com.ar/producto/copy',100002,'in-stock',now()),
('test-fastpath-mixed','mexx','https://www.mexx.com.ar/producto/cheap-old',50000,'in-stock',now()-interval '25 hours'),
('test-fastpath-mixed','venex','https://www.venex.com.ar/producto/current',150000,'in-stock',now()-interval '1 hour'),
('test-fastpath-future','mexx','https://www.mexx.com.ar/producto/future',100003,'in-stock',now()+interval '2 minutes'),
('test-fastpath-unknown','mexx','https://www.mexx.com.ar/producto/unknown',100004,'unknown',now());

-- Forzar también la ruta de recálculo: una oferta vence, otra continúa dentro
-- de la ventana. El precio y la observación originales no se renuevan.
update public.catalog_price_summaries set comparable_valid_until=now()-interval '1 second'
where product_id='test-fastpath-mixed';

do $$
declare old_page jsonb; new_page jsonb; c record; case_count integer:=0;
  fixture_ids text[]:='{}'; page_number integer;
begin
  for c in select * from (values
    ('',null::text,'{}'::text[],100000::numeric,null::numeric,'price-asc',1,12),
    ('',null,'{}',100000,null,'price-asc',2,12),
    ('',null,'{}',100000,null,'price-desc',1,12),
    ('',null,'{}',100000,130000,'price-asc',1,48),
    ('',null,'{}',100000,130000,'price-desc',3,12),
    ('',null,'{}',0,null,'relevance',1,12),
    ('',null,'{}',0,null,'name',2,12),
    ('',null,'{}',0,null,'newest',1,12),
    ('',null,'{}',null,130000,'price-asc',1,12),
    ('',null,'{}',999999999,null,'price-asc',999,12),
    ('','perifericos','{}',0,null,'price-asc',999,12),
    ('','procesadores','{}',0,null,'price-desc',1,12),
    ('',null,array['mexx'],100000,null,'price-asc',1,12),
    ('Fastpath','perifericos','{}',100000,null,'relevance',1,12),
    ('',null,'{}',null,null,'price-asc',1,12)
  ) params(query,category,stores,min_price,max_price,sort,page,size) loop
    old_page:=public.search_catalog_page_baseline(c.query,c.category,c.stores,c.min_price,c.max_price,c.sort,c.page,c.size);
    new_page:=public.search_catalog_page(c.query,c.category,c.stores,c.min_price,c.max_price,c.sort,c.page,c.size);
    assert old_page=new_page,format('Contrato distinto para %s',to_jsonb(c));
    case_count:=case_count+1;
  end loop;
  new_page:=public.search_catalog_page('','perifericos','{}',100000,200000,'price-asc',1,48);
  assert (new_page->>'total')::integer>=271,'Fixtures sin ofertas elegibles';
  for page_number in 1..(new_page->>'totalPages')::integer loop
    new_page:=public.search_catalog_page('','perifericos','{}',100000,200000,'price-asc',page_number,48);
    fixture_ids:=fixture_ids||array(select p->>'id' from jsonb_array_elements(new_page->'products') p
      where p->>'id' like '%fastpath%');
  end loop;
  assert cardinality(fixture_ids)=271,'Cobertura de fixtures distinta: esperar 270 recientes + precio mixto';
  assert not fixture_ids&&array['agrupado-fastpath-expired','test-fastpath-copy','test-fastpath-future','test-fastpath-unknown'];
  new_page:=public.search_catalog_page('','perifericos','{}',150000,150000,'price-asc',1,48);
  assert exists(select 1 from jsonb_array_elements(new_page->'products') p
    where p->>'id'='test-fastpath-mixed' and (p->>'lowest_price')::numeric=150000),
    'El recálculo debe usar el precio vigente y excluir el anterior';
  assert (select min(price)=50000 from public.product_prices where product_id='test-fastpath-mixed');
  assert (select min(last_updated)<now()-interval '24 hours' from public.product_prices where product_id='test-fastpath-mixed');
  assert not (select prosecdef from pg_proc where oid='public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure);
  assert (select 'statement_timeout=8s'=any(proconfig) from pg_proc where oid='public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure);
  raise notice '% comparaciones exactas aprobadas',case_count;
end $$;
-- Replicar los permisos públicos de Supabase en el bootstrap local mínimo.
-- El grant se revierte al terminar, junto con todas las fixtures.
grant select on public.products,public.product_prices to anon;
set local role anon;
do $$ begin
  assert (public.search_catalog_page('','perifericos','{}',100000,200000,'price-asc',1,12)->>'total')::integer>=271,
    'La RPC pública debe devolver ofertas reales de las fixtures';
end $$;
reset role;
rollback;
