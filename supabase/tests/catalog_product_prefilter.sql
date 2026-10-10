-- Sólo PostgreSQL local: probar que el filtro anticipado no descarta coincidencias.
begin;
do $$
declare c record; normalized text; words text[]; query_chip text[]; kind text;
  name text; document text; early boolean; complete boolean; cases integer:=0;
begin
  for c in select * from (values
    ('RTX 5070','Gigabyte RTX 5070 AERO OC 12GB','gpu','https://mexx.com.ar/rtx5070',false),
    ('rtx','PC Ryzen 5 con RTX 5070','gpu','https://mexx.com.ar/pc',false),
    ('ddr5 32 GB 2 x 16 GB 6000 MHz','Kingston Fury DDR5 32GB 2x16GB 6000MHz','ram','https://mexx.com.ar/desktop',false),
    ('ddr5 16gb 5600','Samsung DDR5 16GB 5600','ram','https://mexx.com.ar/notebook-sodimm',true),
    ('ddr4','Kingston DDR4 16GB','ram','https://mexx.com.ar/notebook-sodimm',true),
    ('sodimm ddr4','Kingston SODIMM DDR4 16GB','ram','https://mexx.com.ar/notebook-sodimm',true),
    ('ryzen 5 5600','Procesador AMD Ryzen 5 5600','cpu','https://mexx.com.ar/ryzen',false),
    ('7600','Procesador AMD Ryzen 5 7600','cpu','https://mexx.com.ar/ryzen',false),
    ('','Mouse Logitech G502','cpu','https://mexx.com.ar/mouse',false),
    ('g502 lightspeed','Mouse Logitech G502 LIGHTSPEED','cpu','https://mexx.com.ar/mouse',false),
    ('g502','Mouse Logitech G502 HERO','cpu','https://mexx.com.ar/mouse',false),
    ('5600 x','Procesador AMD Ryzen 5 5600X','cpu','https://mexx.com.ar/ryzen',false)
  ) as fixtures(query,title,query_kind,urls,portable_hint)
  cross join (values(null::text),(''),('notebook sodimm ddr5'),('desktop ram dimm')) extra(document_suffix)
  loop
    normalized:=public.catalog_search_text(c.query); kind:=c.query_kind;
    name:=public.catalog_search_text(c.title);
    document:=name||' '||coalesce(c.document_suffix,'');
    if kind='ram' then normalized:=public.catalog_ram_search_text(normalized); end if;
    words:=array(select word from unnest(string_to_array(normalized,' ')) word where length(word)>1);
    query_chip:=case when kind='ram' or normalized~'^[0-9]{3,5}$' then null else public.catalog_chip(c.query,kind) end;
    early:=kind='ram' or cardinality(words)>2 or not exists(select 1 from unnest(words) word where position(' '||word||' ' in ' '||name||' ')=0);
    complete:=public.catalog_matches_prepared(c.title,name,document,normalized,words,query_chip,kind,c.urls,c.portable_hint);
    assert complete is distinct from true or early is true,
      format('Prefiltro descarta coincidencia completa: %s',to_jsonb(c));
    cases:=cases+1;
  end loop;
  -- La señal de portátil proveniente de la oferta sigue rechazándose después.
  assert public.catalog_matches_prepared('Kingston DDR4 16GB','kingston ddr4 16gb','kingston ddr4 16gb','ddr4',array['ddr4'],null,'ram','',false),
    'Fixture debe superar el prefiltro';
  assert not public.catalog_matches_prepared('Kingston DDR4 16GB','kingston ddr4 16gb','kingston ddr4 16gb','ddr4',array['ddr4'],null,'ram','https://mexx.com.ar/notebook-sodimm',true),
    'Matcher final debe conservar rechazo portátil';
  raise notice '% comparaciones de condición necesaria',cases;
end $$;
rollback;
