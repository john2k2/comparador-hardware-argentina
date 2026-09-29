-- Solo el proceso privilegiado actualiza ofertas conocidas. No usa ni consume
-- la cola/cuota pública; conserva el mismo historial y controles de observación.
create or replace function public.persist_priority_offer(
  p_product_id text, p_store_id text, p_url text,
  p_price numeric, p_original_price numeric, p_stock text,
  p_installment_count integer, p_installment_amount numeric,
  p_run_started_at timestamptz, p_observed_at timestamptz,
  p_review jsonb, p_signature text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare previous public.product_prices;
begin
  if p_run_started_at is null or p_run_started_at < now() - interval '30 minutes'
    or p_run_started_at > now() or p_observed_at is null
    or p_observed_at < p_run_started_at or p_observed_at > now() + interval '1 minute'
    or p_price is null or p_price <= 0 or p_price::text in ('NaN','Infinity','-Infinity')
    or p_stock is null or p_stock not in ('in-stock','low-stock','out-of-stock') then return false; end if;
  select * into previous from public.product_prices
    where product_id = p_product_id and store_id = p_store_id and url = p_url for update;
  if not found or previous.last_updated > p_observed_at then return false; end if;
  if previous.price is distinct from p_price or previous.original_price is distinct from p_original_price or previous.stock is distinct from p_stock then
    insert into public.price_history (product_id, store_id, offer_url, price, original_price, stock, recorded_at)
      values (p_product_id, p_store_id, p_url, p_price, p_original_price, p_stock, p_observed_at);
  end if;
  update public.product_prices set price = p_price, original_price = p_original_price, stock = p_stock,
    installment_count = p_installment_count, installment_amount = p_installment_amount,
    last_updated = p_observed_at, identity_review = coalesce(p_review, identity_review),
    state_signature = p_signature, updated_at = now()
    where product_id = p_product_id and store_id = p_store_id and url = p_url;
  update public.products set last_scraped_at = greatest(coalesce(last_scraped_at, p_observed_at), p_observed_at)
    where id = p_product_id;
  return true;
end $$;

revoke all on function public.persist_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text) from public, anon, authenticated;
grant execute on function public.persist_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text) to service_role;
