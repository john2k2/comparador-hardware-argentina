-- Aplicar antes del consumidor de persist_catalog_offers. Cada lote es atómico;
-- los reintentos comparan el estado real bajo bloqueo, no el snapshot del cliente.
begin;

create or replace function public.persist_catalog_offers(p_offers jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  item jsonb;
  incoming public.product_prices;
  previous public.product_prices;
  inserted_id uuid;
  changed boolean;
begin
  if p_offers is null or jsonb_typeof(p_offers) <> 'array' then
    raise exception 'p_offers must be an array';
  end if;
  if jsonb_array_length(p_offers) > 250 then
    raise exception 'p_offers exceeds 250 offers';
  end if;

  -- Orden estable para que lotes solapados adquieran los bloqueos en el mismo orden.
  for item in select value from jsonb_array_elements(p_offers)
    order by value->>'product_id', value->>'store_id', value->>'url'
  loop
    incoming := jsonb_populate_record(null::public.product_prices, item);
    if incoming.last_updated is null or not isfinite(incoming.last_updated)
      or incoming.last_updated > now() + interval '1 minute'
      or incoming.price is null or incoming.price < 0
      or incoming.price::text in ('NaN', 'Infinity', '-Infinity')
      or incoming.state_signature is null then
      raise exception 'Invalid catalog offer observation';
    end if;

    -- El índice único serializa también dos altas simultáneas de la misma oferta.
    inserted_id := null;
    insert into public.product_prices (
      product_id, store_id, url, price, original_price, stock,
      installment_count, installment_amount, last_updated, state_signature, identity_review
    ) values (
      incoming.product_id, incoming.store_id, incoming.url, incoming.price,
      incoming.original_price, incoming.stock, incoming.installment_count,
      incoming.installment_amount, incoming.last_updated, incoming.state_signature,
      incoming.identity_review
    ) on conflict (product_id, store_id, url) do nothing returning id into inserted_id;

    if inserted_id is not null then
      changed := true;
    else
      select * into strict previous from public.product_prices
        where product_id = incoming.product_id and store_id = incoming.store_id
          and url = incoming.url for update;
      if previous.last_updated > incoming.last_updated then continue; end if;

      changed := row(previous.price, previous.original_price, previous.stock,
        previous.installment_count, previous.installment_amount) is distinct from
        row(incoming.price, incoming.original_price, incoming.stock,
        incoming.installment_count, incoming.installment_amount);

      update public.product_prices set price = incoming.price,
        original_price = incoming.original_price, stock = incoming.stock,
        installment_count = incoming.installment_count,
        installment_amount = incoming.installment_amount,
        last_updated = incoming.last_updated, state_signature = incoming.state_signature,
        identity_review = case when item ? 'identity_review' then incoming.identity_review
          else previous.identity_review end
        where id = previous.id;
    end if;

    if changed then
      insert into public.price_history
        (product_id, store_id, offer_url, price, original_price, stock, recorded_at)
      values (incoming.product_id, incoming.store_id, incoming.url, incoming.price,
        incoming.original_price, incoming.stock, incoming.last_updated);
    end if;
  end loop;
end $$;

revoke all on function public.persist_catalog_offers(jsonb) from public, anon, authenticated;
grant execute on function public.persist_catalog_offers(jsonb) to service_role;

commit;
