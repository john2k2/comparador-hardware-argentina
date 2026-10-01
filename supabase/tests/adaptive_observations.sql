begin;
set local role service_role;
select seed_catalog_refresh_queue();
do $$ declare tok uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); target uuid; observed timestamptz:=now(); evidence jsonb:='{"listingRef":"store-a:url:https://example.com/fixture","title":"Producto de prueba"}'; begin
 select offer_id into target from claim_catalog_refresh(tok,1) limit 1;
 if persist_adaptive_offer(target,wrong,100,null,'unknown',null,null,now(),observed,null,'a',evidence,'unspecified') then raise exception 'wrong lease accepted'; end if;
 if not persist_adaptive_offer(target,tok,100,null,'unknown',null,null,now(),observed,null,'a',evidence,'unspecified') then raise exception 'unknown stock observation rejected'; end if;
 if (select stock from product_prices where id=target) <> 'unknown' then raise exception 'invented stock'; end if;
 if (select count(*) from price_history) <> 1 then raise exception 'missing history'; end if;
 if not persist_adaptive_offer(target,tok,100,null,'unknown',null,null,now(),observed+interval '1 second',null,'a',evidence,'unspecified') then raise exception 'unchanged observation rejected'; end if;
 if (select count(*) from price_history) <> 1 then raise exception 'duplicate unchanged history'; end if;
 if (select last_updated from product_prices where id=target) <> observed+interval '1 second' then raise exception 'observation timestamp not advanced'; end if;
 if persist_adaptive_offer(target,tok,200,null,'unknown',null,null,now(),observed,null,'b',evidence,'unspecified') then raise exception 'older observation accepted'; end if;
 if persist_adaptive_offer(target,tok,200,null,'in-stock',null,null,now(),now()+interval '2 minutes',null,'b',evidence,'unspecified') then raise exception 'future observation accepted'; end if;
 if persist_adaptive_offer(target,tok,200,null,'in-stock',null,null,now(),now()+interval '2 seconds',null,'b',null,'unspecified') then raise exception 'missing source accepted'; end if;
 if not finish_catalog_refresh(target,tok,'observed') then raise exception 'cannot finish'; end if;
 if persist_adaptive_offer(target,tok,200,null,'in-stock',null,null,now(),now()+interval '2 seconds',null,'b',evidence,'unspecified') then raise exception 'finished lease accepted'; end if;
end $$;
rollback;
