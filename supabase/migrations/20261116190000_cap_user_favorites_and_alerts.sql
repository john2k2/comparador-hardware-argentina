-- Tope por usuario de favoritos y alertas. Cada producto con favorito o alerta
-- activa entra al tramo de refresco de 3 h (catalog_refresh_policy): sin tope,
-- una sola cuenta podía promover el catálogo entero y agotar el presupuesto de
-- scraping. No modifica ni borra filas existentes; sólo limita altas nuevas.
begin;
set local lock_timeout='2s';

create or replace function public.enforce_user_tracking_limit()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  current_count bigint;
  max_rows constant integer := tg_argv[0]::integer;
begin
  -- Serializa las altas del mismo usuario: dos inserciones simultáneas no superan el tope.
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ':' || new.user_id::text, 0));

  if tg_table_name = 'user_favorites' then
    select count(*) into current_count from public.user_favorites where user_id = new.user_id;
  elsif tg_table_name = 'price_alerts' then
    select count(*) into current_count from public.price_alerts where user_id = new.user_id;
  else
    raise exception 'enforce_user_tracking_limit: tabla no soportada %', tg_table_name;
  end if;

  if current_count >= max_rows then
    raise exception 'Límite de % elementos alcanzado en %', max_rows, tg_table_name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_user_tracking_limit() from public, anon, authenticated;

drop trigger if exists user_favorites_limit on public.user_favorites;
create trigger user_favorites_limit
before insert on public.user_favorites
for each row execute function public.enforce_user_tracking_limit('200');

drop trigger if exists price_alerts_limit on public.price_alerts;
create trigger price_alerts_limit
before insert on public.price_alerts
for each row execute function public.enforce_user_tracking_limit('100');

commit;
