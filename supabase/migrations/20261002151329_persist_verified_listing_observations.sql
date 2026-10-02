-- Prioridad y cola interactiva guardan la evidencia recién leída en la misma
-- transacción. Los wrappers anteriores conservan locks, historial y leases.
begin;
create function public.catalog_valid_source_evidence(p_source jsonb,p_review jsonb,p_url text)
returns boolean language sql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_typeof(p_source)='object'
  and jsonb_typeof(p_source->'title')='string' and length(trim(p_source->>'title')) between 1 and 400
  and (p_source->>'title') !~* '§|\{\{|<%|\mITEMTIT\M'
  and jsonb_typeof(p_source->'listingRef')='string' and length(p_source->>'listingRef') between 1 and 2048
  and (not(p_source ? 'storeSku') or jsonb_typeof(p_source->'storeSku')='string' and length(p_source->>'storeSku')<=160)
  and (not(p_source ? 'sourceId') or jsonb_typeof(p_source->'sourceId')='string' and p_source->>'sourceId' ~ '^[1-9]\d{0,14}$')
  and (p_review is null or p_review->'sourceIdentity'=p_source and p_review#>>'{subject,url}'=p_url),false);
$$;
create function public.persist_verified_priority_offer(
 p_product_id text,p_store_id text,p_url text,p_price numeric,p_original_price numeric,p_stock text,
 p_installment_count integer,p_installment_amount numeric,p_run_started_at timestamptz,p_observed_at timestamptz,
 p_review jsonb,p_signature text,p_source_identity jsonb,p_price_condition text
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not public.catalog_valid_source_evidence(p_source_identity,p_review,p_url)
  or not coalesce(p_price_condition in ('special','unspecified'),false) then return false; end if;
 if not public.persist_priority_offer(p_product_id,p_store_id,p_url,p_price,p_original_price,p_stock,p_installment_count,p_installment_amount,p_run_started_at,p_observed_at,p_review,p_signature) then return false; end if;
 update public.product_prices set source_identity=p_source_identity,identity_review=p_review,price_condition=p_price_condition
  where product_id=p_product_id and store_id=p_store_id and url=p_url and last_updated=p_observed_at;
 return found;
end $$;
create function public.persist_verified_requested_offer(
 p_job_id uuid,p_lease_token uuid,p_product_id text,p_store_id text,p_url text,p_price numeric,p_original_price numeric,p_stock text,
 p_installment_count integer,p_installment_amount numeric,p_observed_at timestamptz,
 p_review jsonb,p_signature text,p_source_identity jsonb,p_price_condition text
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not public.catalog_valid_source_evidence(p_source_identity,p_review,p_url)
  or not coalesce(p_price_condition in ('special','unspecified'),false) then return false; end if;
 if not public.persist_requested_offer(p_job_id,p_lease_token,p_product_id,p_store_id,p_url,p_price,p_original_price,p_stock,p_installment_count,p_installment_amount,p_observed_at,p_review,p_signature) then return false; end if;
 update public.product_prices set source_identity=p_source_identity,identity_review=p_review,price_condition=p_price_condition
  where product_id=p_product_id and store_id=p_store_id and url=p_url and last_updated=p_observed_at;
 return found;
end $$;
revoke all on function public.catalog_valid_source_evidence(jsonb,jsonb,text),public.persist_verified_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text),public.persist_verified_requested_offer(uuid,uuid,text,text,text,numeric,numeric,text,integer,numeric,timestamptz,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.catalog_valid_source_evidence(jsonb,jsonb,text),public.persist_verified_priority_offer(text,text,text,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text),public.persist_verified_requested_offer(uuid,uuid,text,text,text,numeric,numeric,text,integer,numeric,timestamptz,jsonb,text,jsonb,text) to service_role;
commit;
