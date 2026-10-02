-- Evitar una transacción inicial que exceda el timeout al ingresar miles de altas.
-- El consumidor repite lotes acotados hasta un resultado vacío.
create or replace function public.seed_catalog_refresh_queue() returns integer
language plpgsql security invoker set search_path=pg_catalog,public set jit=off set work_mem='32MB' as $$
declare changed integer;
begin
 insert into public.catalog_offer_refresh_state(offer_id,category)
 select pp.id,p.category from public.product_prices pp join public.products p on p.id=pp.product_id
 left join public.catalog_offer_refresh_state q on q.offer_id=pp.id
 where q.offer_id is null or q.category is distinct from p.category limit 500
 on conflict(offer_id) do update set category=excluded.category
 where catalog_offer_refresh_state.category is distinct from excluded.category;
 get diagnostics changed=row_count; return changed;
end $$;
create function public.sync_catalog_offer_queue() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 insert into public.catalog_offer_refresh_state(offer_id,category)
 select new.id,p.category from public.products p where p.id=new.product_id
 on conflict(offer_id) do nothing;
 return new;
end $$;
create trigger product_prices_catalog_queue after insert on public.product_prices
for each row execute function public.sync_catalog_offer_queue();
create function public.sync_catalog_queue_category() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.catalog_offer_refresh_state q set category=new.category
 from public.product_prices pp where pp.product_id=new.id and pp.id=q.offer_id and q.category is distinct from new.category;
 return new;
end $$;
create trigger products_catalog_queue_category after update of category on public.products
for each row when(old.category is distinct from new.category) execute function public.sync_catalog_queue_category();
revoke all on function public.sync_catalog_offer_queue(),public.sync_catalog_queue_category() from public,anon,authenticated;
grant execute on function public.sync_catalog_offer_queue(),public.sync_catalog_queue_category() to service_role;
