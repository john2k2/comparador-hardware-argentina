-- Ejecutar únicamente en una base descartable y vacía, con las migraciones aplicadas.
-- PGOPTIONS='-c app.pc_builder_test=1' psql ... -v ON_ERROR_STOP=1 -f este-archivo.sql
begin;
do $$ begin
  if current_setting('app.pc_builder_test', true) is distinct from '1'
    or exists (select 1 from public.products) or exists (select 1 from public.requested_offer_refreshes)
  then raise exception 'Usar una base de pruebas vacía y app.pc_builder_test=1'; end if;
end $$;

insert into public.products (id, name, category, model)
  select 'fixture-' || n, 'Ryzen 5 5600', 'procesadores', '5600' from generate_series(1, 16) n;
insert into public.product_prices (product_id, store_id, url, price, stock, last_updated)
  select id, 'mexx', 'https://www.mexx.com.ar/' || id, 100000, 'in-stock', now() - interval '1 day' from public.products;
insert into public.product_prices (product_id, store_id, url, price, stock, last_updated)
  values ('fixture-1', 'venex', 'https://www.venex.com.ar/fixture-1', 120000, 'in-stock', now() - interval '1 day');

do $$
declare targets jsonb; job jsonb; claimed jsonb; duplicate jsonb; job_id uuid; lease uuid; stamp timestamptz; result boolean; n integer;
begin
  assert not has_table_privilege('anon', 'public.requested_offer_refreshes', 'select'), 'anon no debe leer solicitudes';
  assert not has_table_privilege('authenticated', 'public.requested_offer_refreshes', 'insert'), 'usuario no debe escribir solicitudes';
  assert not has_function_privilege('anon', 'public.request_offer_refresh(jsonb,text)', 'execute'), 'RPC privada';
  assert has_function_privilege('service_role', 'public.request_offer_refresh(jsonb,text)', 'execute'), 'servidor autorizado';
  assert (select relrowsecurity from pg_class where oid = 'public.requested_offer_refreshes'::regclass), 'RLS activo';
  targets := '[{"productId":"fixture-1","storeId":"mexx","url":"https://www.mexx.com.ar/fixture-1"}]';
  job := public.request_offer_refresh(targets, repeat('a',64));
  job_id := (job->>'id')::uuid;
  assert job->>'status' = 'queued';
  assert not (job ?| array['lease_token','requester_hash','fingerprint']), 'respuesta pública sin datos privados';
  duplicate := public.request_offer_refresh(targets || targets, repeat('b',64));
  assert duplicate->>'id' = job->>'id', 'coalescer solicitudes duplicadas y targets repetidos';
  assert (select count(*) from public.requested_offer_refreshes) = 1;

  begin
    perform public.request_offer_refresh('[{"productId":"fixture-1","storeId":"mexx","url":"https://evil.example/"}]', repeat('a',64));
    raise exception 'Debió rechazar oferta ajena';
  exception when others then assert sqlerrm = 'REFRESH_OFFER_NOT_FOUND'; end;

  claimed := public.claim_offer_refresh();
  lease := (claimed->>'lease_token')::uuid;
  stamp := (claimed->>'started_at')::timestamptz;
  assert claimed->>'id' = job->>'id' and claimed->>'status' = 'running';
  assert public.claim_offer_refresh() is null, 'un trabajo no se reclama dos veces';
  assert not public.persist_requested_offer(job_id, gen_random_uuid(), 'fixture-1','mexx',targets->0->>'url',90000,null,'in-stock',null,null,stamp,null,'new'), 'rechazar lease ajeno';
  assert not public.persist_requested_offer(job_id, lease, 'fixture-1','venex','https://www.venex.com.ar/fixture-1',90000,null,'in-stock',null,null,stamp,null,'new'), 'no tocar otra oferta';
  assert not public.persist_requested_offer(job_id, lease, 'fixture-1','mexx',targets->0->>'url',90000,null,'in-stock',null,null,stamp - interval '1 second',null,'new'), 'no refrescar fecha con evidencia vieja';
  assert not public.persist_requested_offer(job_id, lease, 'fixture-1','mexx',targets->0->>'url',90000,null,null,null,null,stamp,null,'new'), 'stock obligatorio';
  assert not public.persist_requested_offer(job_id, lease, 'fixture-1','mexx',targets->0->>'url','NaN'::numeric,null,'in-stock',null,null,stamp,null,'new'), 'precio finito';
  result := public.persist_requested_offer(job_id, lease, 'fixture-1','mexx',targets->0->>'url',90000,null,'in-stock',null,null,stamp,'{"status":"needs-review"}', 'new');
  assert result, 'aceptar evidencia nueva y lease válido';
  assert (select price = 90000 and last_updated = stamp from public.product_prices where product_id='fixture-1' and store_id='mexx');
  assert (select price = 120000 from public.product_prices where product_id='fixture-1' and store_id='venex'), 'preservar otras tiendas';
  assert (select count(*) from public.price_history where product_id='fixture-1') = 1, 'guardar historial una vez';
  perform public.persist_requested_offer(job_id, lease, 'fixture-1','mexx',targets->0->>'url',90000,null,'in-stock',null,null,stamp,null,'new');
  assert (select count(*) from public.price_history where product_id='fixture-1') = 1, 'misma observación no duplica historial';
  assert (select identity_review->>'status' = 'needs-review' from public.product_prices where product_id='fixture-1' and store_id='mexx'), 'ausencia de Jev no borra revisión';
  update public.product_prices set last_updated = stamp + interval '20 seconds' where product_id='fixture-1' and store_id='mexx';
  assert not public.persist_requested_offer(job_id, lease, 'fixture-1','mexx',targets->0->>'url',80000,null,'in-stock',null,null,stamp,null,'new'), 'otra actualización más reciente gana';
  update public.requested_offer_refreshes set status='completed', finished_at=now() where id=job_id;
  assert not public.persist_requested_offer(job_id, lease, 'fixture-1','mexx',targets->0->>'url',80000,null,'in-stock',null,null,stamp,null,'new'), 'trabajo terminado no puede escribir';
  assert public.request_offer_refresh(targets, repeat('b',64))->>'id' = job->>'id', 'reutilizar resultado reciente';

  for n in 2..3 loop
    perform public.request_offer_refresh(jsonb_build_array(jsonb_build_object('productId','fixture-'||n,'storeId','mexx','url','https://www.mexx.com.ar/fixture-'||n)), repeat('a',64));
  end loop;
  begin
    perform public.request_offer_refresh('[{"productId":"fixture-4","storeId":"mexx","url":"https://www.mexx.com.ar/fixture-4"}]', repeat('a',64));
    raise exception 'Debió limitar solicitante';
  exception when others then assert sqlerrm = 'REFRESH_RATE_LIMIT'; end;
  for n in 4..12 loop
    perform public.request_offer_refresh(jsonb_build_array(jsonb_build_object('productId','fixture-'||n,'storeId','mexx','url','https://www.mexx.com.ar/fixture-'||n)), lpad(to_hex(n),64,'0'));
  end loop;
  begin
    perform public.request_offer_refresh('[{"productId":"fixture-13","storeId":"mexx","url":"https://www.mexx.com.ar/fixture-13"}]', repeat('f',64));
    raise exception 'Debió limitar cola global';
  exception when others then assert sqlerrm = 'REFRESH_RATE_LIMIT'; end;
  update public.requested_offer_refreshes set expires_at=now() - interval '1 second' where status='queued';
  assert public.claim_offer_refresh() is null, 'no ejecutar trabajos vencidos';
  assert (select count(*) from public.requested_offer_refreshes where status='failed') = 11, 'vencimientos terminales';
  raise notice 'OK: permisos, dedupe, cuotas, lease, fechas, stock, historial y expiración';
end $$;
rollback;
