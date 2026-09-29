-- Ejecutar con psql -v ON_ERROR_STOP=1 -f en una base LOCAL con las migraciones.
-- Todos los datos, funciones y triggers de prueba se revierten al terminar.
begin;

insert into public.products (id, name, category, model)
values ('test-atomic-catalog', 'Test CPU', 'procesadores', 'Test CPU');

create function pg_temp.catalog_offer(amount numeric, observed timestamptz, review jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object('product_id', 'test-atomic-catalog', 'store_id', 'mexx',
    'url', 'https://example.invalid/test-atomic', 'price', amount,
    'stock', 'in-stock', 'last_updated', observed, 'state_signature', amount::text)
    || case when review is null then '{}'::jsonb else jsonb_build_object('identity_review', review) end;
$$;

create function pg_temp.fail_catalog_history() returns trigger language plpgsql as $$
begin
  if new.product_id = 'test-atomic-catalog' and current_setting('test.fail_history', true) = 'yes' then
    raise exception 'simulated history failure';
  end if;
  return new;
end $$;
create trigger test_fail_catalog_history before insert on public.price_history
for each row execute function pg_temp.fail_catalog_history();

do $$
declare
  old_offer jsonb := pg_temp.catalog_offer(100000, now() - interval '4 hours', '{"status":"consistent"}');
  new_offer jsonb := pg_temp.catalog_offer(110000, now() - interval '1 hour');
  failed boolean := false;
begin
  assert not has_function_privilege('anon', 'public.persist_catalog_offers(jsonb)', 'execute');
  assert not has_function_privilege('authenticated', 'public.persist_catalog_offers(jsonb)', 'execute');
  assert has_function_privilege('service_role', 'public.persist_catalog_offers(jsonb)', 'execute');

  -- Una nueva oferta y su primer evento se crean juntos.
  perform public.persist_catalog_offers(jsonb_build_array(old_offer));
  assert (select count(*) = 1 from public.price_history where product_id = 'test-atomic-catalog');

  -- Si falla el historial, ni siquiera el precio actualizado queda confirmado.
  perform set_config('test.fail_history', 'yes', true);
  begin
    perform public.persist_catalog_offers(jsonb_build_array(new_offer));
  exception when raise_exception then
    if sqlerrm <> 'simulated history failure' then raise; end if;
    failed := true;
  end;
  assert failed, 'La inyección de fallo debe ejecutarse';
  assert (select price = 100000 from public.product_prices where product_id = 'test-atomic-catalog');
  assert (select lowest = 100000 from public.catalog_price_summaries where product_id = 'test-atomic-catalog');
  assert (select count(*) = 1 from public.price_history where product_id = 'test-atomic-catalog');

  -- El reintento recupera el cambio y una respuesta perdida no duplica el evento.
  perform set_config('test.fail_history', 'no', true);
  perform public.persist_catalog_offers(jsonb_build_array(new_offer));
  perform public.persist_catalog_offers(jsonb_build_array(new_offer));
  assert (select price = 110000 and identity_review = '{"status":"consistent"}'::jsonb
    from public.product_prices where product_id = 'test-atomic-catalog');
  assert (select count(*) = 2 from public.price_history where product_id = 'test-atomic-catalog');
  assert (select lowest = 110000 from public.catalog_price_summaries where product_id = 'test-atomic-catalog');

  -- Una observación atrasada no retrocede precio, fecha ni revisión.
  perform public.persist_catalog_offers(jsonb_build_array(old_offer));
  assert (select price = 110000 and last_updated = (new_offer->>'last_updated')::timestamptz
    from public.product_prices where product_id = 'test-atomic-catalog');
  assert (select count(*) = 2 from public.price_history where product_id = 'test-atomic-catalog');

  -- Frescura e identidad cambian sin fabricar una transición de precio.
  perform public.persist_catalog_offers(jsonb_build_array(
    pg_temp.catalog_offer(110000, now(), '{"status":"needs-review"}')));
  assert (select last_updated = now() and identity_review = '{"status":"needs-review"}'::jsonb
    from public.product_prices where product_id = 'test-atomic-catalog');
  assert (select count(*) = 2 from public.price_history where product_id = 'test-atomic-catalog');

  -- Un lote con una segunda fila inválida revierte también la primera.
  failed := false;
  begin
    perform public.persist_catalog_offers(jsonb_build_array(
      pg_temp.catalog_offer(120000, now()),
      pg_temp.catalog_offer(-1, now()) || '{"url":"https://example.invalid/z-invalid"}'::jsonb));
  exception when raise_exception then
    if sqlerrm <> 'Invalid catalog offer observation' then raise; end if;
    failed := true;
  end;
  assert failed;
  assert (select price = 110000 from public.product_prices where product_id = 'test-atomic-catalog');
  assert (select count(*) = 2 from public.price_history where product_id = 'test-atomic-catalog');

  -- También debe revertirse el alta cuando falla su primer evento histórico.
  failed := false;
  perform set_config('test.fail_history', 'yes', true);
  begin
    perform public.persist_catalog_offers(jsonb_build_array(
      new_offer || '{"url":"https://example.invalid/new-offer"}'::jsonb));
  exception when raise_exception then
    if sqlerrm <> 'simulated history failure' then raise; end if;
    failed := true;
  end;
  assert failed;
  assert (select count(*) = 1 from public.product_prices where product_id = 'test-atomic-catalog');
end $$;

rollback;
