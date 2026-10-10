begin read only;
set local statement_timeout='8s';
do $test$
declare
  target_name text := 'PLACA DE VIDEO GeForce RTX 5070 12GB GIGABYTE AERO OC';
  source_name text := 'PLACA DE VIDEO GIGABYTE RTX 5070 AERO OC 12GB';
  listing_url text := 'https://goldentechstore.com.ar/producto/placa-de-video-gigabyte-rtx-5070-aero-oc-12gb/';
  source_identity jsonb;
  review jsonb;
  expected jsonb := '{"family":"rtx","model":"5070","suffixes":"","memory":"12","brand":"gigabyte","series":"aero","edition":"aero","fans":"","color":"","memoryType":"","clock":"oc"}';
  candidate text;
begin
  if public.catalog_exact_offer_attributes(target_name,'tarjetas-graficas') is distinct from expected
    or public.catalog_exact_offer_attributes(source_name,'tarjetas-graficas') is distinct from expected then raise exception 'AERO_TS_SQL_PROOF_PARITY'; end if;
  foreach candidate in array array[
    replace(source_name,'AERO','GAMING'), replace(source_name,'AERO','WINDFORCE'),
    replace(source_name,'5070','5070 Ti'), replace(source_name,'12GB','16GB'),
    replace(source_name,'GIGABYTE','ASUS'), replace(source_name,'OC','SIN OC'),
    replace(source_name,' OC',''), replace(source_name,' AERO','')
  ] loop
    if public.catalog_exact_offer_attributes(candidate,'tarjetas-graficas')=expected then raise exception 'AERO_INCOMPATIBLE_VARIANT_ACCEPTED: %',candidate; end if;
  end loop;
  source_identity:=jsonb_build_object('title',source_name,'sourceId','121118','storeSku','VGA455','listingRef','goldentechstore:url:'||rtrim(listing_url,'/'));
  review:=jsonb_build_object('version',1,'status','consistent','reason','exact-attributes','reviewedAt','2026-10-10T20:00:00Z','model',null,'confidence',null,
    'subject',jsonb_build_object('name',public.catalog_identity_text(target_name),'category','tarjetas-graficas','url',listing_url),
    'sourceIdentity',source_identity,'proof',jsonb_build_object('version',1,'method','exact-attributes','attributes',expected));
  if not public.catalog_offer_is_comparable(1791820.27,'in-stock',listing_url,review,target_name,'tarjetas-graficas',source_identity,'goldentechstore') then raise exception 'AERO_BOUND_PROOF_REJECTED'; end if;
  if public.catalog_offer_is_comparable(1791820.27,'unknown',listing_url,review,target_name,'tarjetas-graficas',source_identity,'goldentechstore')
    or public.catalog_offer_is_comparable(1791820.27,'out-of-stock',listing_url,review,target_name,'tarjetas-graficas',source_identity,'goldentechstore')
    or public.catalog_offer_is_comparable(0,'in-stock',listing_url,review,target_name,'tarjetas-graficas',source_identity,'goldentechstore') then raise exception 'AERO_STOCK_PRICE_GUARD_REGRESSION'; end if;
  if public.catalog_offer_is_comparable(1791820.27,'in-stock',listing_url,review,target_name,'tarjetas-graficas',source_identity||'{"storeSku":"changed"}','goldentechstore')
    or public.catalog_offer_is_comparable(1791820.27,'in-stock',listing_url,review,target_name,'tarjetas-graficas',source_identity||'{"title":"GIGABYTE RTX 5070 GAMING OC 12GB"}','goldentechstore') then raise exception 'AERO_SOURCE_BINDING_REGRESSION'; end if;
  if public.catalog_exact_offer_attributes('DDR4 8GB XPG 3200MHZ GAMMIX D35 BLACK','memoria-ram') is not null
    or public.catalog_exact_offer_attributes('MEMORIA RAM KINGSTON FURY BEAST 8GB (1X8) 3600MHZ CL17','memoria-ram') is not null then raise exception 'AERO_CHANGED_RAM_RULES'; end if;
end $test$;
rollback;
