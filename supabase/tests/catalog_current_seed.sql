-- Local: canónico vencido, precio fuera de rango y señal portátil en oferta.
begin;
insert into public.products(id,name,model,category,last_scraped_at) values
('agrupado-seed-stale','Mouse RTX Seed Canonico','Seed canonico','perifericos',now()-interval '2 days'),
('test-seed-stale-copy','Mouse RTX Seed Canonico','Seed canonico','perifericos',now()),
('agrupado-seed-range','Mouse RTX Seed Rango','Seed rango','perifericos',now()),
('test-seed-range-copy','Mouse RTX Seed Rango','Seed rango','perifericos',now()),
('agrupado-seed-portable','Mouse RTX Seed Portatil','Seed portatil','perifericos',now()-interval '2 days'),
('test-seed-portable-copy','Mouse RTX Seed Portatil','Seed portatil','perifericos',now()),
('test-seed-expired-summary','Mouse RTX Seed Recalculo','Seed recalculo','perifericos',now()),
('test-seed-legacy-valid','Mouse RTX Seed Legacy','Seed legacy','perifericos',now());
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated) values
('agrupado-seed-stale','mexx','https://www.mexx.com.ar/producto/seed-canonical',150000,'in-stock',now()-interval '25 hours'),
('test-seed-stale-copy','venex','https://www.venex.com.ar/producto/seed-copy',150001,'in-stock',now()),
('agrupado-seed-range','mexx','https://www.mexx.com.ar/producto/seed-range',70000,'in-stock',now()),
('test-seed-range-copy','venex','https://www.venex.com.ar/producto/seed-range-copy',150002,'in-stock',now()),
('agrupado-seed-portable','mexx','https://www.mexx.com.ar/producto/notebook-ddr4-seed',150003,'in-stock',now()-interval '25 hours'),
('test-seed-portable-copy','venex','https://www.venex.com.ar/producto/seed-desktop',150004,'in-stock',now()),
('test-seed-expired-summary','mexx','https://www.mexx.com.ar/producto/seed-recalculation',150005,'in-stock',now()),
('test-seed-legacy-valid','mexx','https://www.mexx.com.ar/producto/seed-legacy',150006,'in-stock',now());
update public.catalog_price_summaries set comparable_valid_until=now()-interval '1 second'
where product_id='test-seed-expired-summary';
-- El camino cacheado original no exige latest si la estadística sigue válida.
update public.catalog_price_summaries set comparable_latest_observed_at=null
where product_id='test-seed-legacy-valid';
do $$
declare c record; a jsonb; b jsonb; ids text[]; cases integer:=0;
begin
  for c in select * from (values
    ('rtx',null::numeric,null::numeric),('rtx',0::numeric,null::numeric),
    ('rtx',100000::numeric,200000::numeric),('rtx',null::numeric,200000::numeric)
  ) q(query,min_price,max_price)
  cross join unnest(array['relevance','price-asc','price-desc','name','newest']) sort
  cross join (values('{}'::text[]),(array['mexx']),(array['venex'])) stores(value)
  loop
    b:=public.search_catalog_page(c.query,'perifericos',c.value,c.min_price,c.max_price,c.sort,2,2);
    -- El harness conserva el original; CI ejecuta las aserciones independientes.
    if to_regprocedure('public.search_catalog_page_baseline(text,text,text[],numeric,numeric,text,integer,integer)') is not null then
      a:=public.search_catalog_page_baseline(c.query,'perifericos',c.value,c.min_price,c.max_price,c.sort,2,2);
      assert a=b,format('Seed cambia semántica canónico/portable/tienda: %s',to_jsonb(c));
    end if;
    cases:=cases+1;
  end loop;
  a:=public.search_catalog_page('rtx','perifericos','{}',100000,200000,'price-asc',1,48);
  ids:=array(select p->>'id' from jsonb_array_elements(a->'products') p);
  assert not('agrupado-seed-stale'=any(ids)) and not('test-seed-stale-copy'=any(ids)),
    'Seed debe conservar exclusión del canónico vencido y no resucitar copia';
  assert not('agrupado-seed-range'=any(ids)) and not('test-seed-range-copy'=any(ids)),
    'Seed debe elegir canónico ANTES del rango';
  assert not('agrupado-seed-portable'=any(ids)) and 'test-seed-portable-copy'=any(ids),
    'Matcher de oferta portátil puede excluir canónico antes de elegir copia válida';
  assert 'test-seed-expired-summary'=any(ids),'Seed debe recalcular resumen vencido';
  assert 'test-seed-legacy-valid'=any(ids),'Seed debe conservar estadística válida con latest ausente';
  raise notice '% casos de seed; cinco aserciones independientes (paridad sólo con baseline)',cases;
end $$;
rollback;
