-- Ejecutar después de la fixture y la migración; no altera datos de producción.
begin;
set local role service_role;
select public.seed_catalog_refresh_queue();
do $$ declare n integer; maintenance integer; tok uuid := gen_random_uuid(); tok2 uuid := gen_random_uuid(); target uuid; old_date timestamptz; begin
  if has_table_privilege('anon','public.catalog_refresh_interest','SELECT')
    or has_table_privilege('authenticated','public.catalog_offer_refresh_state','SELECT')
    or has_function_privilege('anon','public.claim_catalog_refresh(uuid,integer)','EXECUTE') then raise exception 'public access'; end if;
  if (select count(*) from catalog_offer_refresh_state) <> 49 then raise exception 'incomplete queue'; end if;
  if (select count(*) from catalog_refresh_policy) <> 48 then raise exception 'inactive store'; end if;
  select count(*), count(*) filter(where reason='maintenance') into n,maintenance from claim_catalog_refresh(tok,12);
  if n <> 12 or maintenance < 3 then raise exception 'maintenance starvation: % %',n,maintenance; end if;
  select count(*) into n from claim_catalog_refresh(tok2,60);
  if n <> 36 then raise exception 'lease overlap: %',n; end if;
  select offer_id into target from catalog_offer_refresh_state where lease_token=tok limit 1;
  select last_updated into old_date from product_prices where id=target;
  if finish_catalog_refresh(target,tok2,'observed') then raise exception 'wrong token'; end if;
  if not finish_catalog_refresh(target,tok,'no-observation') then raise exception 'cannot finish'; end if;
  if (select last_updated from product_prices where id=target) is distinct from old_date then raise exception 'false fresh'; end if;
  if (select next_attempt_at from catalog_offer_refresh_state where offer_id=target) < now()+interval '59 minutes' then raise exception 'no backoff'; end if;
  if finish_catalog_refresh(target,tok,'observed') then raise exception 'finish twice'; end if;
  update catalog_offer_refresh_state set leased_until=now()-interval '1 minute' where lease_token=tok2;
  select count(*) into n from claim_catalog_refresh(tok,60);
  if n <> 36 then raise exception 'cannot resume: %',n; end if;
end $$;
reset role;
insert into user_favorites values ('mouse-1');
insert into catalog_refresh_interest(product_id,view_users,outbound_users,period_start,period_end,expires_at)
 values ('mouse-2',5,0,current_date-7,current_date-1,now()+interval '8 days');
set local role service_role;
do $$ begin
  if (select interval_hours from catalog_refresh_policy where product_id='mouse-1') <> 3 then raise exception 'tracked priority'; end if;
  if (select interval_hours from catalog_refresh_policy where product_id='mouse-2') <> 20 then raise exception 'analytics promotion'; end if;
  if (select jsonb_array_length(catalog_refresh_coverage())) < 4 then raise exception 'coverage lost'; end if;
  update catalog_refresh_interest set expires_at=now()+interval '1 second' where product_id='mouse-2';
end $$;
rollback;
