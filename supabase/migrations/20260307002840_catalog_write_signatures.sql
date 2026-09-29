begin;

alter table public.products
  add column if not exists content_signature text null;

alter table public.product_prices
  add column if not exists state_signature text null;

create or replace function public.set_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'products' then
    if new.content_signature is not distinct from old.content_signature then
      new.updated_at = old.updated_at;
    else
      new.updated_at = now();
    end if;
  elsif tg_table_name = 'product_prices' then
    if new.state_signature is not distinct from old.state_signature then
      new.updated_at = old.updated_at;
    else
      new.updated_at = now();
    end if;
  else
    new.updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_catalog_updated_at();

drop trigger if exists product_prices_set_updated_at on public.product_prices;
create trigger product_prices_set_updated_at
before update on public.product_prices
for each row execute function public.set_catalog_updated_at();

commit;
