-- Cobertura de componentes con stock: cuenta el último stock observado, sin inferir nada.
-- Ejecutar después de las migraciones; no altera datos de producción.
begin;
insert into public.stores(id,name,url,is_active) values ('coverage-store','Coverage','https://coverage.example',true)
 on conflict(id) do update set is_active=true;
insert into public.products(id,name,model,category) values
 ('coverage-cpu','Procesador AMD Ryzen 7600','7600','procesadores');
insert into public.product_prices(product_id,store_id,url,price,stock,last_updated) values
 ('coverage-cpu','coverage-store','https://coverage.example/in-2h',100,'in-stock',now()-interval '2 hours'),
 ('coverage-cpu','coverage-store','https://coverage.example/low-10h',100,'low-stock',now()-interval '10 hours'),
 ('coverage-cpu','coverage-store','https://coverage.example/in-30h',100,'in-stock',now()-interval '30 hours'),
 ('coverage-cpu','coverage-store','https://coverage.example/out-1h',100,'out-of-stock',now()-interval '1 hour'),
 ('coverage-cpu','coverage-store','https://coverage.example/unknown-1h',100,'unknown',now()-interval '1 hour');
do $$
declare cov jsonb;
begin
 select jsonb_build_object(
   'total', sum((g->>'total')::int), 'observed_24h', sum((g->>'observed_24h')::int),
   'stock_total', sum((g->>'stock_total')::int), 'stock_observed_24h', sum((g->>'stock_observed_24h')::int),
   'stock_observed_3h', sum((g->>'stock_observed_3h')::int))
 into cov
 from jsonb_array_elements(public.catalog_refresh_coverage()) g where g->>'store_id' = 'coverage-store';
 -- Los campos anteriores no cambian: 5 ofertas, 4 observadas en 24 h.
 assert (cov->>'total')::int = 5, format('Total anterior: %s', cov);
 assert (cov->>'observed_24h')::int = 4, format('Observadas 24 h anteriores: %s', cov);
 -- Con stock = in-stock o low-stock según la última observación; agotado y desconocido quedan afuera.
 assert (cov->>'stock_total')::int = 3, format('Denominador con stock: %s', cov);
 assert (cov->>'stock_observed_24h')::int = 2, format('Con stock observadas en 24 h: %s', cov);
 assert (cov->>'stock_observed_3h')::int = 1, format('Con stock observadas en 3 h: %s', cov);
 assert not has_function_privilege('anon','public.catalog_refresh_coverage()','EXECUTE'), 'La cobertura sigue privada';
 assert has_function_privilege('service_role','public.catalog_refresh_coverage()','EXECUTE'), 'El runner conserva acceso';
end $$;
rollback;
