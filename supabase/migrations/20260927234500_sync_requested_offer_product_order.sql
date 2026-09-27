-- Reflejar las observaciones a pedido en el orden de lectura del catálogo.
-- Conserva autorización, lease, URL exacta y validación de fechas.
create or replace function public.persist_requested_offer(
  p_job_id uuid, p_lease_token uuid, p_product_id text, p_store_id text, p_url text,
  p_price numeric, p_original_price numeric, p_stock text, p_installment_count integer, p_installment_amount numeric,
  p_observed_at timestamptz, p_review jsonb, p_signature text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare previous public.product_prices; job public.requested_offer_refreshes;
begin
  select * into job from public.requested_offer_refreshes where id = p_job_id for update;
  if not found or job.status <> 'running' or job.lease_token is distinct from p_lease_token or job.expires_at <= now() then return false; end if;
  if not exists (select 1 from jsonb_array_elements(job.targets) t where t->>'productId' = p_product_id and t->>'storeId' = p_store_id and t->>'url' = p_url) then return false; end if;
  if p_price is null or p_price <= 0 or p_price::text in ('NaN','Infinity','-Infinity')
    or p_stock is null or p_stock not in ('in-stock','low-stock','out-of-stock')
    or p_observed_at is null or p_observed_at < job.started_at or p_observed_at > now() + interval '1 minute' then return false; end if;
  select * into previous from public.product_prices where product_id = p_product_id and store_id = p_store_id and url = p_url for update;
  if not found or previous.last_updated > p_observed_at then return false; end if;
  if previous.price is distinct from p_price or previous.original_price is distinct from p_original_price or previous.stock is distinct from p_stock then
    insert into public.price_history (product_id, store_id, offer_url, price, original_price, stock, recorded_at)
      values (p_product_id, p_store_id, p_url, p_price, p_original_price, p_stock, p_observed_at);
  end if;
  update public.product_prices set price = p_price, original_price = p_original_price, stock = p_stock,
    installment_count = p_installment_count, installment_amount = p_installment_amount, last_updated = p_observed_at,
    identity_review = coalesce(p_review, identity_review), state_signature = p_signature, updated_at = now()
    where product_id = p_product_id and store_id = p_store_id and url = p_url;
  -- La oferta cambió, por lo que el producto debe volver a entrar en las
  -- lecturas acotadas ordenadas por actualización. La frescura de cada oferta
  -- sigue dependiendo exclusivamente de product_prices.last_updated.
  update public.products set updated_at = now() where id = p_product_id;
  return true;
end $$;

revoke all on function public.persist_requested_offer(uuid, uuid, text, text, text, numeric, numeric, text, integer, numeric, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.persist_requested_offer(uuid, uuid, text, text, text, numeric, numeric, text, integer, numeric, timestamptz, jsonb, text) to service_role;

-- Reparar únicamente filas con una observación reciente ya persistida.
-- No cambia precios, stock ni la fecha de las ofertas.
update public.products p set updated_at = now()
where exists (select 1 from public.product_prices pp where pp.product_id = p.id
  and pp.last_updated >= now() - interval '3 hours' and pp.last_updated <= now());
