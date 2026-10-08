-- Ejecutar después de las migraciones; no altera datos de producción.
begin;
insert into public.stores(id,name,url,is_active) values ('mexx','Mexx','https://mexx.com.ar',true)
 on conflict(id) do update set is_active=true;
insert into public.products(id,name,model,category) values
 ('window-cpu','Procesador AMD Ryzen 7600','7600','procesadores'),
 ('window-mouse','Mouse Logitech G203','G203','perifericos'),
 ('window-hot','Mouse Logitech G305','G305','perifericos'),
 ('window-case','Gabinete Lian Li Lancool 216','216','gabinetes');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated) values
 ('window-cpu','mexx','https://mexx.com.ar/window/cpu-21h',100,'in-stock',now()-interval '21 hours'),
 ('window-cpu','mexx','https://mexx.com.ar/window/cpu-19h',100,'in-stock',now()-interval '19 hours'),
 ('window-mouse','mexx','https://mexx.com.ar/window/mouse-21h',100,'in-stock',now()-interval '21 hours'),
 ('window-hot','mexx','https://mexx.com.ar/window/hot-21h',100,'in-stock',now()-interval '21 hours'),
 ('window-case','mexx','https://mexx.com.ar/window/case-73h',100,'in-stock',now()-interval '73 hours');
insert into public.catalog_refresh_interest(product_id,view_users,outbound_users,period_start,period_end,expires_at)
 values ('window-hot',5,0,current_date-7,current_date-1,now()+interval '8 days');
insert into auth.users(id) values ('00000000-0000-4000-8000-00000000c0de');
insert into public.user_favorites(user_id,product_id) values ('00000000-0000-4000-8000-00000000c0de','window-case');
do $$
declare tok uuid := gen_random_uuid();
begin
 assert not has_table_privilege('anon','public.catalog_refresh_policy','select')
   and not has_table_privilege('authenticated','public.catalog_refresh_policy','select'), 'La vista sigue privada';
 assert has_table_privilege('service_role','public.catalog_refresh_policy','select'), 'El runner conserva lectura';
 assert (select interval_hours from public.catalog_refresh_policy where url like '%cpu-21h') = 20, 'Componentes a 20 h';
 assert (select interval_hours from public.catalog_refresh_policy where url like '%hot-21h') = 20, 'Interés a 20 h';
 assert (select interval_hours from public.catalog_refresh_policy where url like '%mouse-21h') = 168, 'Mantenimiento sin cambios';
 assert (select interval_hours from public.catalog_refresh_policy where url like '%case-73h') = 3, 'Seguimiento sin cambios';
 assert (select reason from public.catalog_refresh_policy where url like '%cpu-21h') = 'components';
 assert (select reason from public.catalog_refresh_policy where url like '%hot-21h') = 'analytics';
 create temporary table window_claimed on commit drop as select * from public.claim_catalog_refresh(tok,60) c where c.url like 'https://mexx.com.ar/window/%';
 assert exists(select 1 from window_claimed where url like '%cpu-21h'), 'Un componente de 21 h vuelve a la cola dentro de la ventana de 24 h';
 assert exists(select 1 from window_claimed where url like '%hot-21h'), 'Un producto con interés de 21 h vuelve a la cola';
 assert not exists(select 1 from window_claimed where url like '%cpu-19h'), 'Un componente de 19 h todavía no vence';
 assert not exists(select 1 from window_claimed where url like '%mouse-21h'), 'Mantenimiento conserva 168 h';
 assert exists(select 1 from window_claimed where url like '%case-73h'), 'Seguimiento conserva 3 h';
end $$;
rollback;
