-- Reversión exacta del cuerpo previo; rechaza drift del candidato.
begin;
set local lock_timeout='2s';
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text)'::regprocedure) <> 'e9b5e6728307e9b7dd08c91d813d112e' then
  raise exception 'Restricted purchase rollback: catalog_offer_is_comparable cambió';
 end if;
 if exists (select 1 from pg_proc where oid='public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text)'::regprocedure
   and (prosecdef or provolatile<>'s' or proparallel<>'s' or pronargdefaults<>0
     or proconfig is distinct from array['search_path=pg_catalog, public']::text[])) then
  raise exception 'Restricted purchase: contrato de seguridad/configuración cambió';
 end if;
end $guard$;
create or replace function public.catalog_offer_is_comparable(p_price numeric,p_stock text,p_url text,p_review jsonb,p_name text,p_category text,p_source jsonb,p_store text)
returns boolean language plpgsql stable parallel safe security invoker set search_path=pg_catalog,public as $$
declare source jsonb:=coalesce(p_source,p_review->'sourceIdentity'); target_attributes jsonb; observed_attributes jsonb; host text; expected_host text;
begin
 if p_price is null or p_price<=0 or p_price::text in ('NaN','Infinity','-Infinity') or p_stock is null or p_stock not in ('in-stock','low-stock') then return false; end if;
 if p_url !~ '^https://[^/@:?#]+/[^?#]+' or p_url ~* '[?&](token|session|access_token|api_key|apikey|password|auth)='
   or p_url ~* '^https://[^/]+/(cart|checkout|carrito|mi-cuenta|wp-admin|wp-json|categoria|category|product-category|search)(/|[?#]|$)' then return false; end if;
 if p_store is not null then
  host:=lower((regexp_match(p_url,'^https://([^/@:?#]+)(?:/|$)'))[1]);
  select lower((regexp_match(url,'^https?://([^/@:?#]+)'))[1]) into expected_host from public.stores where id=p_store;
  if host is null or (expected_host is not null and regexp_replace(host,'^www\.','')<>regexp_replace(expected_host,'^www\.','')) then return false; end if;
 end if;
 if source is not null and source<>'null'::jsonb and not coalesce(jsonb_typeof(source)='object'
   and jsonb_typeof(source->'title')='string' and length(trim(source->>'title')) between 1 and 400
   and jsonb_typeof(source->'listingRef')='string' and length(source->>'listingRef') between 1 and 2048
   and (not(source ? 'storeSku') or jsonb_typeof(source->'storeSku')='string' and length(source->>'storeSku')<=160)
   and (not(source ? 'sourceId') or jsonb_typeof(source->'sourceId')='string' and source->>'sourceId' ~ '^[1-9]\d{0,14}$'),false) then return false; end if;
 if public.catalog_explicit_offer_conflict(p_name,p_category,source->>'title')
   or public.catalog_explicit_offer_conflict(p_name,p_category,regexp_replace(split_part(split_part(p_url,'?',1),'#',1),'^https://[^/]+/','')) then return false; end if;
 if p_review is not null and p_review<>'null'::jsonb and p_source is not null and (
  public.catalog_identity_text(p_source->>'title') is distinct from public.catalog_identity_text(p_review#>>'{sourceIdentity,title}')
  or p_source->>'listingRef' is distinct from p_review#>>'{sourceIdentity,listingRef}'
  or coalesce(p_source->>'storeSku','')<>coalesce(p_review#>>'{sourceIdentity,storeSku}','')
  or coalesce(p_source->>'sourceId','')<>coalesce(p_review#>>'{sourceIdentity,sourceId}','')) then return false; end if;
 if p_review->>'reason'='exact-attributes' then
  target_attributes:=public.catalog_exact_offer_attributes(p_name,p_category);
  observed_attributes:=public.catalog_exact_offer_attributes(source->>'title',p_category);
  return coalesce(target_attributes is not null and target_attributes=observed_attributes
   and p_review->'version'='1'::jsonb and p_review->>'status'='consistent'
   and p_review#>>'{subject,name}'=public.catalog_identity_text(p_name) and p_review#>>'{subject,category}'=p_category and p_review#>>'{subject,url}'=p_url
   and p_review#>>'{proof,method}'='exact-attributes' and p_review#>'{proof,version}'='1'::jsonb and p_review#>'{proof,attributes}'=target_attributes
   and p_review->'model'='null'::jsonb and p_review->'confidence'='null'::jsonb
   and isfinite((p_review->>'reviewedAt')::timestamptz),false);
 end if;
 return public.catalog_offer_is_comparable(p_price,p_stock,p_url,p_review,p_name,p_category);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end $$;
commit;
