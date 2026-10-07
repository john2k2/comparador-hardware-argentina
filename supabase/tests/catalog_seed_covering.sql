-- Replay local de todas las migraciones antes de este test. No datos remotos.
begin;
insert into public.stores(id,name,url)
select 'test-seed-store-'||g,'Test seed source '||g,'https://example.invalid/seed-source/'||g
from generate_series(1,20) g;
insert into public.products(id,name,category,model) values
  ('test-seed-general-cpu','AMD Ryzen 5 5600','procesadores','Ryzen 5 5600'),
  ('test-seed-general-bundle','Combo Ryzen 5 5600 + Motherboard B550','procesadores','Fixture combo'),
  ('test-seed-general-misc','Artículo de mantenimiento','perifericos','Fixture');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
select case when g%3=0 then 'test-seed-general-cpu' when g%3=1 then 'test-seed-general-bundle' else 'test-seed-general-misc' end,
  'test-seed-store-'||(1+(g-1)%20),'https://example.invalid/seed-offer/'||g,100,'in-stock',now()
from generate_series(1,501) g;

do $$
declare n integer;
begin
  assert (select count(*)=2 from pg_index
    where indexrelid in('public.products_catalog_seed_lookup_idx'::regclass,
      'public.product_prices_catalog_seed_lookup_idx'::regclass)
    and indisvalid and indpred is null and indnkeyatts=1 and indnatts=2),
    'Los covering son generales, válidos y contienen una columna adicional';
  assert pg_get_indexdef('public.products_catalog_seed_lookup_idx'::regclass)
    like '%(id) INCLUDE (category)%';
  assert pg_get_indexdef('public.product_prices_catalog_seed_lookup_idx'::regclass)
    like '%(id) INCLUDE (product_id)%';
  assert (select not catalog_component from products where id='test-seed-general-bundle'),
    'La prueba incluye una oferta fuera del índice parcial de componentes';
  assert (select count(distinct pp.store_id)=20 from catalog_offer_refresh_state q
    join product_prices pp on pp.id=q.offer_id where pp.product_id like 'test-seed-general-%');
  n:=public.seed_catalog_refresh_queue(); assert n=0, 'Los triggers ya prepararon las altas';
  delete from catalog_offer_refresh_state q using product_prices pp
    where pp.id=q.offer_id and pp.product_id like 'test-seed-general-%';
  n:=public.seed_catalog_refresh_queue(); assert n=500, 'Máximo 500 escrituras';
  n:=public.seed_catalog_refresh_queue(); assert n=1, 'La oferta restante conserva su identidad';
  n:=public.seed_catalog_refresh_queue(); assert n=0, 'La cola completa es idempotente';
  assert (select count(*)=501 from catalog_offer_refresh_state q join product_prices pp on pp.id=q.offer_id
    join products p on p.id=pp.product_id where pp.product_id like 'test-seed-general-%' and q.category=p.category);

  update catalog_offer_refresh_state q set category='almacenamiento',
    last_attempt_at='2026-10-06 00:00Z',next_attempt_at='2026-10-08 00:00Z',failures=3,
    lease_token='00000000-0000-0000-0000-000000000001',leased_until='2026-10-08 00:15Z',last_result='source-failed'
    from product_prices pp where pp.id=q.offer_id and pp.product_id like 'test-seed-general-%';
  n:=public.seed_catalog_refresh_queue(); assert n=500;
  n:=public.seed_catalog_refresh_queue(); assert n=1;
  n:=public.seed_catalog_refresh_queue(); assert n=0;
  assert (select count(*)=501 from catalog_offer_refresh_state q join product_prices pp on pp.id=q.offer_id
    join products p on p.id=pp.product_id where pp.product_id like 'test-seed-general-%' and q.category=p.category
      and q.last_attempt_at='2026-10-06 00:00Z' and q.next_attempt_at='2026-10-08 00:00Z' and q.failures=3
      and q.lease_token='00000000-0000-0000-0000-000000000001' and q.leased_until='2026-10-08 00:15Z'
      and q.last_result='source-failed'), 'Reconciliar categoría conserva lease, intentos y reintentos';
  assert not (select prosecdef from pg_proc where oid='public.seed_catalog_refresh_queue()'::regprocedure);
  assert not has_function_privilege('anon','public.seed_catalog_refresh_queue()','execute');
  assert not has_function_privilege('authenticated','public.seed_catalog_refresh_queue()','execute');
  assert has_function_privilege('service_role','public.seed_catalog_refresh_queue()','execute');
end $$;
rollback;
