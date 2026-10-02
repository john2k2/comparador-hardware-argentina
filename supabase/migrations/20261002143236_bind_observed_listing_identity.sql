-- La revisión semántica debe corresponder a la evidencia actual de la publicación.
-- Rechaza títulos de plantilla sin resolver también cuando el runner anterior siga activo.
begin;
set local lock_timeout='5s'; set local statement_timeout='60s';
create or replace function public.persist_adaptive_offer(
  p_offer_id uuid,p_token uuid,p_price numeric,p_original_price numeric,p_stock text,
  p_installment_count integer,p_installment_amount numeric,
  p_run_started_at timestamptz,p_observed_at timestamptz,
  p_review jsonb,p_signature text,p_source_identity jsonb,p_price_condition text
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare previous public.product_prices; product_key text;
begin
 if p_run_started_at is null or p_run_started_at < now()-interval '30 minutes' or p_run_started_at>now()
   or p_observed_at is null or p_observed_at<p_run_started_at or p_observed_at>now()+interval '1 minute'
   or p_price is null or p_price<=0 or p_price::text in ('NaN','Infinity','-Infinity')
   or p_stock is null or p_stock not in ('in-stock','low-stock','out-of-stock','unknown')
   or p_price_condition is null or p_price_condition not in ('special','unspecified')
   or (p_source_identity->>'title') ~* '§|\{\{|<%|\mITEMTIT\M'
   or not coalesce(jsonb_typeof(p_source_identity)='object'
     and jsonb_typeof(p_source_identity->'title')='string' and length(trim(p_source_identity->>'title')) between 1 and 400
     and jsonb_typeof(p_source_identity->'listingRef')='string' and length(p_source_identity->>'listingRef') between 1 and 2048,false)
   then return false; end if;
 select product_id into product_key from public.product_prices where id=p_offer_id;
 if not found then return false; end if;
 -- Mismo orden de bloqueo que el read model y las observaciones prioritarias.
 perform 1 from public.products where id=product_key for update;
 select * into previous from public.product_prices where id=p_offer_id for update;
 if not found or previous.last_updated>p_observed_at then return false; end if;
 perform 1 from public.catalog_offer_refresh_state
   where offer_id=p_offer_id and lease_token=p_token and leased_until>now() for update;
 if not found then return false; end if;
 if p_price_condition='special' and previous.store_id not in ('compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek') then return false; end if;
 if previous.price is distinct from p_price or previous.original_price is distinct from p_original_price or previous.stock is distinct from p_stock then
   insert into public.price_history(product_id,store_id,offer_url,price,original_price,stock,recorded_at)
     values(previous.product_id,previous.store_id,previous.url,p_price,p_original_price,p_stock,p_observed_at);
 end if;
 update public.product_prices set price=p_price,original_price=p_original_price,stock=p_stock,
   installment_count=p_installment_count,installment_amount=p_installment_amount,last_updated=p_observed_at,
   identity_review=case
     when p_review is not null then p_review
     when identity_review is null then null
     when identity_review->'sourceIdentity' = p_source_identity then identity_review
     else jsonb_build_object('version',1,'status','needs-review','reason','insufficient-evidence',
       'reviewedAt',null,'model',null,'confidence',null,'sourceIdentity',p_source_identity,
       'subject',jsonb_build_object('name',public.catalog_identity_text((select name from public.products where id=product_key)),
         'category',(select category from public.products where id=product_key),'url',previous.url))
     end,state_signature=p_signature,source_identity=p_source_identity,
   price_condition=p_price_condition,updated_at=now() where id=p_offer_id;
 update public.products set last_scraped_at=greatest(coalesce(last_scraped_at,p_observed_at),p_observed_at) where id=product_key;
 return true;
end $$;
revoke all on function public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text) to service_role;

commit;


