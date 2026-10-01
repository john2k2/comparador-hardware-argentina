-- Rotar fuentes con lectura compartida contrastada sin ampliar el presupuesto total.
-- Evitar JIT y ordenar sólo columnas pequeñas, no las URLs del catálogo.
create or replace function public.claim_catalog_feed_refresh(p_token uuid, p_limit integer default 24)
returns table(offer_id uuid, product_id text, store_id text, url text, interval_hours integer, reason text)
language plpgsql security invoker set search_path = pg_catalog, public set jit = off set work_mem = '32MB' as $$
begin
  if p_token is null or p_limit < 1 or p_limit > 60 then raise exception 'REFRESH_INVALID_CLAIM'; end if;
  return query
  with due as materialized (
    select v.offer_id,v.store_id,v.interval_hours,v.reason,v.last_attempt_at,v.last_updated, row_number() over (partition by v.store_id, (v.interval_hours > 24)
      order by v.last_attempt_at nulls first, v.last_updated nulls first, v.offer_id) store_rank
    from public.catalog_refresh_policy v
    where v.store_id in ('compragamer','maxtecno','katech')
      and coalesce(v.next_attempt_at,'-infinity'::timestamptz) <= now()
      and coalesce(v.leased_until,'-infinity'::timestamptz) <= now()
      and (v.last_updated is null or v.last_updated <= now() - make_interval(hours => v.interval_hours))
  ), maintenance as (
    select d.offer_id from due d where d.interval_hours > 24
    order by d.store_rank, d.last_attempt_at nulls first, d.last_updated nulls first, d.offer_id
    limit greatest(1, p_limit / 4)
  ), candidates as (
    select d.* from due d
    order by (d.offer_id in (select m.offer_id from maintenance m)) desc,
      (d.interval_hours <= 24) desc, d.store_rank, d.last_attempt_at nulls first, d.offer_id
    limit p_limit
  ), locked as (
    select q.offer_id from public.catalog_offer_refresh_state q join candidates c on c.offer_id = q.offer_id
    where coalesce(q.leased_until,'-infinity'::timestamptz) <= now()
    order by q.offer_id for update of q skip locked
  ), claimed as (
    update public.catalog_offer_refresh_state q set lease_token = p_token, leased_until = now() + interval '20 minutes'
    from locked l where q.offer_id = l.offer_id returning q.offer_id
  )
  select c.offer_id,pp.product_id,c.store_id,pp.url,c.interval_hours,c.reason
    from candidates c join claimed cl on cl.offer_id = c.offer_id
    join public.product_prices pp on pp.id=c.offer_id
    order by c.store_rank, c.offer_id;
end $$;

REVOKE ALL ON FUNCTION public.claim_catalog_feed_refresh(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_catalog_feed_refresh(uuid,integer) TO service_role;
