-- Componentes y productos con interés vencían recién al salir de la ventana de 24 h
-- que mide la cobertura. A 20 h vuelven a la cola con margen para observarse dentro de ella.
-- Las RPC de reclamo leen interval_hours de esta vista y separan mantenimiento con > 24:
-- 20 h conserva su prioridad frente al mantenimiento.
create or replace view public.catalog_refresh_policy with (security_invoker = true) as
with tracked as (
  select product_id from public.user_favorites
  union select product_id from public.price_alerts where is_active = true
)
select pp.id offer_id, pp.product_id, pp.store_id, pp.url, pp.last_updated,
  case when t.product_id is not null then 3
    when coalesce(i.view_users,0) >= 5 or coalesce(i.outbound_users,0) >= 2 then 20
    when q.category in ('procesadores','tarjetas-graficas','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion') then 20
    when q.category in ('gabinetes','refrigeracion') then 72 else 168 end interval_hours,
  case when t.product_id is not null then 'tracked'
    when coalesce(i.view_users,0) >= 5 or coalesce(i.outbound_users,0) >= 2 then 'analytics'
    when q.category in ('procesadores','tarjetas-graficas','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion') then 'components'
    when q.category in ('gabinetes','refrigeracion') then 'build-support' else 'maintenance' end reason,
  q.last_attempt_at, q.next_attempt_at, q.leased_until
from public.product_prices pp
join public.stores s on s.id = pp.store_id and s.is_active = true
left join tracked t on t.product_id = pp.product_id
left join public.catalog_refresh_interest i on i.product_id = pp.product_id and i.expires_at > now()
left join public.catalog_offer_refresh_state q on q.offer_id = pp.id;
