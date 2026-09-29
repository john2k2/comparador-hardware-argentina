-- La limpieza utiliza el mismo orden de bloqueo ficha->oferta que los refresh.
begin;
create function public.delete_catalog_offers(p_offers jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare deleted integer;
begin
  if p_offers is null or jsonb_typeof(p_offers)<>'array' then raise exception 'p_offers must be an array'; end if;
  if jsonb_array_length(p_offers)>250 then raise exception 'p_offers exceeds 250 offers'; end if;
  perform 1 from public.products where id in(select value->>'product_id' from jsonb_array_elements(p_offers)) order by id for update;
  delete from public.product_prices price where exists(
    select 1 from jsonb_array_elements(p_offers) offer
    where price.product_id=offer->>'product_id' and price.store_id=offer->>'store_id' and price.url=offer->>'url'
  );
  get diagnostics deleted=row_count;
  return deleted;
end $$;
revoke all on function public.delete_catalog_offers(jsonb) from public,anon,authenticated;
grant execute on function public.delete_catalog_offers(jsonb) to service_role;
commit;
