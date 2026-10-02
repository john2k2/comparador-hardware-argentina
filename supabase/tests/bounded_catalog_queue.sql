begin;
insert into public.products(id,name,category,model) values('test-queue-batch','Memoria RAM DDR4 16GB','memoria-ram','DDR4 16GB');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated)
 select 'test-queue-batch','mexx','https://example.invalid/queue/'||g,100,'in-stock',now() from generate_series(1,501) g;
do $$
declare n integer;
begin
 assert (select count(*)=501 from public.catalog_offer_refresh_state q join public.product_prices pp on pp.id=q.offer_id where pp.product_id='test-queue-batch'), 'Un alta entra inmediatamente en la cola';
 update public.products set category='perifericos' where id='test-queue-batch';
 assert not exists(select 1 from public.catalog_offer_refresh_state q join public.product_prices pp on pp.id=q.offer_id where pp.product_id='test-queue-batch' and q.category<>'perifericos'), 'La categoría se sincroniza sin perder reservas';
 delete from public.catalog_offer_refresh_state where offer_id in(select id from public.product_prices where product_id='test-queue-batch');
 n:=public.seed_catalog_refresh_queue(); assert n=500;
 n:=public.seed_catalog_refresh_queue(); assert n=1;
 n:=public.seed_catalog_refresh_queue(); assert n=0;
 assert not has_function_privilege('anon','public.sync_catalog_offer_queue()','execute');
end $$;
rollback;
