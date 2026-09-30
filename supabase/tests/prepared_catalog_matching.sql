-- Prueba local reversible: semántica anterior, accesorios y consultas amplias.
begin;
create or replace function public.catalog_matches_legacy_qa(title text, document text, query text, urls text)
returns boolean language plpgsql immutable parallel safe set search_path = pg_catalog, public as $$
declare
  normalized text := public.catalog_search_text(query);
  name text := public.catalog_search_text(title);
  words text[] := array(select word from unnest(string_to_array(normalized, ' ')) word where length(word) > 1);
  token text; matched integer := 0; query_chip text[]; product_chip text[]; kind text;
begin
  if normalized = '' then return true; end if;
  foreach token in array words loop
    if position(' ' || token || ' ' in ' ' || document || ' ') = 0 then return false; end if;
    if position(' ' || token || ' ' in ' ' || name || ' ') > 0 then matched := matched + 1; end if;
    if token = any(array['aorus','strix','tuf','dual','prime','proart','eagle','windforce','gaming','ventus','shadow','suprim','trinity','phoenix','pulse','nitro','challenger','hellhound','tomahawk','mortar','ds3h','hero','lightspeed'])
      and position(' ' || token || ' ' in ' ' || name || ' ') = 0 then return false; end if;
  end loop;
  if matched < (case when cardinality(words) <= 2 then cardinality(words) else ceil(cardinality(words) * 0.7)::int end) then return false; end if;
  foreach token in array string_to_array(normalized, ' ') loop
    if token = any(array['x','g','f','k']) and exists (
      select 1 from unnest(words) word where word ~ '^\d{3,5}$' or (word ~ '[a-z]' and word ~ '[0-9]')
    ) and not exists (
      select 1 from unnest(words) word
      where (word ~ '^\d{3,5}$' or (word ~ '[a-z]' and word ~ '[0-9]'))
        and (position(word || token in name) > 0 or position(' ' || word || ' ' || token || ' ' in ' ' || name || ' ') > 0)
    ) then return false; end if;
  end loop;
  if public.catalog_search_text(title || ' ' || coalesce(urls, '')) ~ '\m(sodimm|so\s*dimm|notebook|laptop)\M'
    and normalized !~ '\m(sodimm|so\s*dimm|notebook|laptop)\M'
    and (normalized || ' ' || name || ' ' || public.catalog_search_text(urls)) ~ '\m(ddr[45]|ram|memoria|sodimm|dimm)\M'
    then return false; end if;
  kind := 'gpu'; query_chip := public.catalog_chip(query, kind);
  if query_chip is null then kind := 'cpu'; query_chip := public.catalog_chip(query, kind); end if;
  if query_chip is not null then
    product_chip := public.catalog_chip(title, kind);
    if product_chip is null or query_chip[2] <> product_chip[2] then return false; end if;
    if query_chip[1] <> 'unknown' and product_chip[1] <> 'unknown'
      and regexp_replace(query_chip[1], '[3579]$', '') <> regexp_replace(product_chip[1], '[3579]$', '') then return false; end if;
    if query_chip[3] <> '' and query_chip[3] <> product_chip[3] then return false; end if;
  end if;
  return true;
end $$;


do $$
declare title text; query text; url text;
begin
 foreach title in array array['AMD Ryzen 5 5600XT mejor que 5600X','Procesador AMD Ryzen 5 5500 + Wraith Stealth Cooler','MSI RTX 4070 Ti Super','Mouse Logitech G502 X','Memoria DDR5 32GB','RAM DDR5 Nótébook 32GB','Cooler CPU compatible AMD Ryzen','Fuente Cooler Master 650W'] loop
 foreach query in array array['ryzen','ryzen 5600x','rtx','rtx 4070 ti','rtx 4070 ti super','g502 x','ddr5 32gb','notebook','a','ryzen 5 5500'] loop
 foreach url in array array['','https://example.invalid/sodimm-ddr5','https://example.invalid/so-dimm','https://example.invalid/notebook'] loop
  assert public.catalog_matches_query(title,public.catalog_search_text(title),query,url)
   is not distinct from public.catalog_matches_legacy_qa(title,public.catalog_search_text(title),query,url), 'Divergencia del matcher: ' || title || ' / ' || query;
 end loop; end loop; end loop;
 assert not public.catalog_standalone('Gabinete Thermaltake V200 Ryzen Edition','procesadores');
 assert not public.catalog_standalone('Mother Asrock A320M Ryzen M-ATX','procesadores');
 assert not public.catalog_standalone('Memoria DDR4 compatible AMD Ryzen','procesadores');
 assert public.catalog_standalone('Memoria DDR4 compatible AMD Ryzen','memoria-ram');
 assert not public.catalog_standalone('Cooler CPU compatible AMD Ryzen','procesadores');
 assert not public.catalog_standalone('Watercooler Corsair TITAN 240 RX RGB','tarjetas-graficas');
 assert public.catalog_standalone('Procesador AMD Ryzen 5 5500 + Wraith Stealth Cooler','procesadores');
 assert not public.catalog_cooling_title('Fuente Cooler Master 650W');
 assert not public.catalog_cooling_title('Gabinete Cooler Master Elite 302');
 assert public.catalog_cooling_title('Cooler Master Hyper 212');
end $$;
insert into public.products(id,name,category,model)
values ('qa-cooler','Cooler CPU compatible AMD Ryzen','procesadores','qa-cooler'),
 ('qa-water','Watercooler Corsair TITAN 240 RX RGB','tarjetas-graficas','qa-water'),
 ('qa-cpu','Procesador AMD Ryzen 5 5500 + Wraith Stealth Cooler','procesadores','qa-cpu');
insert into public.product_prices(product_id,store_id,url,price,stock)
select id,'mexx','https://example.invalid/'||id,100000,'in-stock' from public.products where id like 'qa-%';
do $$
declare result jsonb;
begin
 result := public.search_catalog_page(p_query=>'ryzen',p_category=>'procesadores');
 assert result->>'total'='1' and result#>>'{products,0,id}'='qa-cpu';
 result := public.search_catalog_page(p_query=>'rx',p_category=>'tarjetas-graficas');
 assert result->>'total'='0';
end $$;
rollback;
