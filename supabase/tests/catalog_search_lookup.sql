begin;
insert into public.products(id,name,model,category) values('narrow-write','Mouse RTX Narrow','Narrow','perifericos');
do $$ declare original_ctid tid; key text; cases integer:=0; begin
  assert (select count(*)=1 from public.products_search_lookup where id='narrow-write');
  select ctid into original_ctid from public.products_search_lookup where id='narrow-write';
  update public.products set last_scraped_at=now(),updated_at=now(),lowest_price=123,highest_price=456,average_price=222 where id='narrow-write';
  assert (select ctid=original_ctid from public.products_search_lookup where id='narrow-write'),'Observación ensucia lookup';
  -- Cada fuente de metadata entra en catalog_document y debe sincronizarse.
  foreach key in array array['name','brand','model','normalized_title','family_key','variant_key','canonical_product_key'] loop
    execute format('update public.products set %I=%L where id=%L',key,'Mouse RTX Narrow '||key,'narrow-write');
    assert not exists(select 1 from public.products p join public.products_search_lookup l using(id)
      where p.id='narrow-write' and (p.category,p.catalog_identity,p.catalog_name,p.catalog_document)
       is distinct from (l.category,l.catalog_identity,l.catalog_name,l.catalog_document));
    cases:=cases+1;
  end loop;
  update public.products set category='almacenamiento' where id='narrow-write';
  assert (select category='almacenamiento' from public.products_search_lookup where id='narrow-write');
  update public.products set id='narrow-write-renamed' where id='narrow-write';
  assert not exists(select 1 from public.products_search_lookup where id='narrow-write');
  assert exists(select 1 from public.products_search_lookup where id='narrow-write-renamed');
  delete from public.products where id='narrow-write-renamed';
  assert not exists(select 1 from public.products_search_lookup where id='narrow-write-renamed');
  insert into public.products(id,name,model,category) values('narrow-component','PC gamer Ryzen RTX DDR5','Component','procesadores');
  assert not exists(select 1 from public.products_search_lookup where id='narrow-component');
  update public.products set name='Ryzen 5 5600' where id='narrow-component';
  assert exists(select 1 from public.products_search_lookup where id='narrow-component');
  update public.products set name='PC gamer Ryzen RTX DDR5' where id='narrow-component';
  assert not exists(select 1 from public.products_search_lookup where id='narrow-component');
  insert into public.products(id,name,model,category) values('lookup-cascade','Mouse Narrow','Cascade','perifericos');
  update public.products set id='lookup-cascade-new',name='PC gamer Ryzen RTX DDR5',category='procesadores' where id='lookup-cascade';
  assert not exists(select 1 from public.products_search_lookup where id in('lookup-cascade','lookup-cascade-new')),'FK cascade deja componente obsoleto';
  update public.products set id='lookup-cascade-component',name='Ryzen 5 5600' where id='lookup-cascade-new';
  assert exists(select 1 from public.products_search_lookup where id='lookup-cascade-component');
  insert into public.products(id,name,model,category) values('narrow-long',repeat('Mouse RTX largotitulo ',500),'Long','perifericos');
  assert (select octet_length(catalog_document)>10000 from public.products_search_lookup where id='narrow-long');
  insert into public.products(id,name,model,category) select 'lookup-long-'||n,'Mouse '||(select string_agg(md5(i::text),'') from generate_series(1,n)i),'Long','perifericos' from unnest(array[45,47,50,53])n;
  assert (select count(*)=4 from public.products_search_lookup where id like 'lookup-long-%');
  assert not has_table_privilege('anon','public.products_search_lookup','INSERT');
  assert not has_table_privilege('anon','public.products_search_lookup','UPDATE');
  assert not has_table_privilege('anon','public.products_search_lookup','DELETE');
  assert not has_function_privilege('anon','public.sync_products_search_lookup()','EXECUTE');
  assert not has_table_privilege('service_role','public.products_search_lookup','INSERT');
  assert not has_table_privilege('service_role','public.products_search_lookup','UPDATE');
  assert not has_table_privilege('service_role','public.products_search_lookup','DELETE');
  raise notice 'Metadata sources %; timestamp/price, category, ID, delete, component transitions, >10k title, ACL passed',cases;
end $$;
set local role anon;
select count(*) as anon_visible_lookup_rows from public.products_search_lookup;
do $$ begin
  begin
    insert into public.products_search_lookup values('forbidden','perifericos','x','x','x');
    raise exception 'Anon pudo escribir';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
  assert (select count(*)>0 from public.products_search_lookup);
  begin
    update public.products_search_lookup set catalog_name='incorrecto' where id='narrow-long';
    raise exception 'Servicio pudo alterar la proyección fuera del trigger';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
