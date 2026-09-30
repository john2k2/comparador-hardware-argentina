-- Ejecutar exclusivamente en PostgreSQL local desechable, después de bootstrap-local,
-- esquema inicial y migración user_auth_favorites_alerts. No simula el servidor OAuth.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'catalog_auth_qa' or inet_server_addr() <> '127.0.0.1'::inet then
    raise exception 'Exigir base local catalog_auth_qa';
  end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant select,insert,update,delete on public.user_profiles,public.user_favorites,public.price_alerts to authenticated,anon;
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','qa-a@example.invalid','{}'),
 ('22222222-2222-4222-8222-222222222222','qa-b@example.invalid','{}');
insert into public.products(id,name,model,category) values ('qa-isolation','QA','QA','procesadores');
insert into public.user_favorites(user_id,product_id) values
 ('11111111-1111-4111-8111-111111111111','qa-isolation'),
 ('22222222-2222-4222-8222-222222222222','qa-isolation');
insert into public.price_alerts(user_id,product_id,trigger_mode,target_price) values
 ('11111111-1111-4111-8111-111111111111','qa-isolation','target_price',100),
 ('22222222-2222-4222-8222-222222222222','qa-isolation','target_price',200);

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare t text; affected integer; visible integer; begin
  foreach t in array array['user_profiles','user_favorites','price_alerts'] loop
    execute format('select count(*) from public.%I',t) into visible;
    if visible<>1 then raise exception '%: ve datos ajenos',t; end if;
    execute format('update public.%I set updated_at=now() where user_id=%L',t,'22222222-2222-4222-8222-222222222222');
    get diagnostics affected=row_count;
    if affected<>0 then raise exception '%: modifica datos ajenos',t; end if;
    begin
      execute format('update public.%I set user_id=%L where user_id=%L',t,'22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
      raise exception '%: permite cambiar dueño',t;
    exception when insufficient_privilege then null; end;
    execute format('update public.%I set updated_at=now() where user_id=%L',t,'11111111-1111-4111-8111-111111111111');
    get diagnostics affected=row_count;
    if affected<>1 then raise exception '%: impide edición propia',t; end if;
    raise notice '%: lectura/edición propia, lectura/edición cruzada y transferencia verificadas',t;
  end loop;
  foreach t in array array['user_favorites','price_alerts'] loop
    execute format('delete from public.%I where user_id=%L',t,'22222222-2222-4222-8222-222222222222');
    get diagnostics affected=row_count;
    if affected<>0 then raise exception '%: permite borrar ajeno',t; end if;
    execute format('delete from public.%I where user_id=%L',t,'11111111-1111-4111-8111-111111111111');
    get diagnostics affected=row_count;
    if affected<>1 then raise exception '%: no borra propio',t; end if;
    begin
      execute format('insert into public.%I(user_id,product_id) values(%L,%L)',t,'22222222-2222-4222-8222-222222222222','qa-isolation');
      raise exception '%: permite insertar para otro usuario',t;
    exception when insufficient_privilege then null; end;
    execute format('insert into public.%I(user_id,product_id) values(%L,%L)',t,'11111111-1111-4111-8111-111111111111','qa-isolation');
    raise notice '%: insertar/borrar propio y bloqueo cruzado verificados',t;
  end loop;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  if (select target_price from price_alerts)<>200 or (select count(*) from user_favorites)<>1
    or (select email from user_profiles)<>'qa-b@example.invalid' then
    raise exception 'El usuario B perdió datos o ve datos de A';
  end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare t text; n integer; begin
  foreach t in array array['user_profiles','user_favorites','price_alerts'] loop
    execute format('select count(*) from public.%I',t) into n;
    if n<>0 then raise exception '%: anónimo puede leer datos',t; end if;
    begin
      execute format('insert into public.%I(user_id%s) values(%L%s)',t,
        case when t='user_profiles' then '' else ',product_id' end,
        '11111111-1111-4111-8111-111111111111',
        case when t='user_profiles' then '' else ',''qa-isolation''' end);
      raise exception '%: anónimo puede escribir',t;
    exception when insufficient_privilege then null; end;
    raise notice '%: anónimo sin lectura ni escritura',t;
  end loop;
end $$;
reset role;
rollback;
\echo 'PASS: 30 comprobaciones de aislamiento; datos de prueba revertidos.'
