-- Inventario privado: presencia y URL de tienda no equivalen a stock ni precio.
create table public.catalog_inventory_sources (
 store_id text primary key references public.stores(id),
 last_attempt_at timestamptz, last_success_at timestamptz, last_scan_token uuid,
 last_completion_token uuid, last_completion_success boolean,
 next_attempt_at timestamptz not null default '-infinity',
 lease_token uuid, leased_until timestamptz, summary jsonb not null default '{}',
 check ((lease_token is null) = (leased_until is null))
);
create table public.catalog_inventory_listings (
 store_id text not null references public.stores(id), source_id text not null,
 url text not null, title text not null, previous_url text,
 product_id text references public.products(id), last_seen_at timestamptz not null,
 scan_token uuid not null, primary key(store_id,source_id),
 check (length(source_id) between 1 and 160 and length(title) between 1 and 400 and length(url) between 1 and 2048)
);
alter table public.catalog_inventory_sources enable row level security;
alter table public.catalog_inventory_listings enable row level security;
revoke all on public.catalog_inventory_sources,public.catalog_inventory_listings from public,anon,authenticated;
grant all on public.catalog_inventory_sources,public.catalog_inventory_listings to service_role;

create function public.claim_catalog_inventory(p_store_id text,p_token uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_token is null or p_store_id not in ('compragamer','maxtecno','katech') then return false; end if;
 insert into public.catalog_inventory_sources(store_id) values(p_store_id) on conflict do nothing;
 update public.catalog_inventory_sources set lease_token=p_token,leased_until=now()+interval '17 minutes',last_attempt_at=now()
 where store_id=p_store_id and next_attempt_at<=now() and coalesce(leased_until,'-infinity')<=now();
 return found;
end $$;
create function public.register_catalog_inventory(p_store_id text,p_token uuid,p_entries jsonb) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_entries is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)>250 then return false; end if;
 if exists(select 1 from jsonb_to_recordset(p_entries) as e(source_id text,url text,title text,last_seen_at timestamptz)
   where coalesce(e.source_id,'') !~ '^[0-9]+$' or e.url is null or e.title is null or e.last_seen_at is null
   or e.last_seen_at<now()-interval '17 minutes' or e.last_seen_at>now()+interval '1 minute') then return false; end if;
 perform 1 from public.catalog_inventory_sources where store_id=p_store_id and lease_token=p_token and leased_until>now() for update;
 if not found then return false; end if;
 insert into public.catalog_inventory_listings(store_id,source_id,url,title,product_id,last_seen_at,scan_token)
 select p_store_id,e.source_id,e.url,e.title,e.product_id,e.last_seen_at,p_token
 from jsonb_to_recordset(p_entries) as e(source_id text,url text,title text,product_id text,last_seen_at timestamptz)
 where e.last_seen_at between now()-interval '17 minutes' and now()+interval '1 minute'
 on conflict(store_id,source_id) do update set
 previous_url=case when catalog_inventory_listings.url<>excluded.url then catalog_inventory_listings.url else catalog_inventory_listings.previous_url end,
 url=excluded.url,title=excluded.title,
 product_id=coalesce(catalog_inventory_listings.product_id,excluded.product_id),
 last_seen_at=excluded.last_seen_at,scan_token=excluded.scan_token;
 return true;
end $$;
create function public.finish_catalog_inventory(p_store_id text,p_token uuid,p_success boolean,p_summary jsonb) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_success is null or p_summary is null or jsonb_typeof(p_summary)<>'object' then return false; end if;
 update public.catalog_inventory_sources set
 last_success_at=case when p_success then now() else last_success_at end,
 last_scan_token=case when p_success then p_token else last_scan_token end,
 next_attempt_at=now()+case when p_success then interval '24 hours' else interval '1 hour' end,
 summary=p_summary,lease_token=null,leased_until=null
 ,last_completion_token=p_token,last_completion_success=p_success
 where store_id=p_store_id and lease_token=p_token and leased_until>now();
 if found then return true; end if;
 return exists(select 1 from public.catalog_inventory_sources where store_id=p_store_id
   and last_completion_token=p_token and last_completion_success=p_success and summary=p_summary);
end $$;
revoke all on function public.claim_catalog_inventory(text,uuid),public.register_catalog_inventory(text,uuid,jsonb),public.finish_catalog_inventory(text,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.claim_catalog_inventory(text,uuid),public.register_catalog_inventory(text,uuid,jsonb),public.finish_catalog_inventory(text,uuid,boolean,jsonb) to service_role;

-- El wrapper mantiene bloqueo de ficha y transacción de precio/historial.
-- Las escrituras antiguas que omiten estas evidencias no borran las existentes.
create or replace function public.persist_catalog_offers(p_offers jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_offers is null or jsonb_typeof(p_offers)<>'array' then raise exception 'p_offers must be an array'; end if;
 if jsonb_array_length(p_offers)>250 then raise exception 'p_offers exceeds 250 offers'; end if;
 if exists(select 1 from jsonb_array_elements(p_offers) e where
   (e ? 'source_identity' and (jsonb_typeof(e->'source_identity')<>'object'
    or coalesce(length(e->'source_identity'->>'title'),0) not between 1 and 400
    or coalesce(length(e->'source_identity'->>'listingRef'),0) not between 1 and 2048))
   or (e ? 'price_condition' and coalesce(e->>'price_condition','') not in ('special','unspecified')))
 then raise exception 'Invalid source evidence'; end if;
 perform 1 from public.products where id in(select value->>'product_id' from jsonb_array_elements(p_offers)) order by id for update;
 perform public.persist_catalog_offers_unlocked(p_offers);
 update public.product_prices pp set
 source_identity=case when e ? 'source_identity' then e->'source_identity' else pp.source_identity end,
 price_condition=case when e ? 'price_condition' then e->>'price_condition' else pp.price_condition end
 from jsonb_array_elements(p_offers) e where pp.product_id=e->>'product_id' and pp.store_id=e->>'store_id' and pp.url=e->>'url'
 and pp.last_updated=(e->>'last_updated')::timestamptz;
end $$;
revoke all on function public.persist_catalog_offers(jsonb) from public,anon,authenticated;
grant execute on function public.persist_catalog_offers(jsonb) to service_role;
