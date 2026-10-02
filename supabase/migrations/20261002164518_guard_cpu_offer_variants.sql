-- Evitar variantes CPU agrupadas por una clave histórica de chip.
-- No reasigna productos, ofertas, stock ni fechas de observación.
begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
create or replace function public.catalog_cpu_variant_attributes(p_name text)
returns jsonb language plpgsql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
declare t text:=public.catalog_identity_text(p_name); packaging text; excluded boolean; included boolean;
begin
 select coalesce(string_agg(v,'-' order by v),'') into packaging from (select distinct x[1] v from regexp_matches(t,'\m(box|tray|oem)\M','g') x) a;
 excluded:=t ~ '\m(sin|no|s)\s+(cooler|disipador)\M|\mno\s+incluye\s+(cooler|disipador)\M';
 included:=t ~ '\m(con|c)\s+(cooler|disipador)\M|\m(cooler|disipador)\s+incluid[oa]\M|\mwraith\s+(stealth|spire|prism)\M';
 return jsonb_build_object('packaging',packaging,
  'cooler',case when excluded and included then 'conflict' when excluded then 'excluded' when included then 'included' else '' end,
  'condition',case when t ~ '\moutlet\M' then 'outlet' when t ~ '\m(usado|used)\M' then 'used' when t ~ '\m(reacondicionado|refurbished)\M' then 'refurbished' else '' end);
end $$;
create or replace function public.catalog_exact_offer_attributes(p_name text,p_category text)
returns jsonb language plpgsql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
declare t text:=public.catalog_identity_text(p_name); chip text[]; brand text; series text; edition text; fans text; color text; memory_type text; clock text; memory text; key text; form text; variant text; kit text; latency text; speed text; generation text; packaging text;
begin
 if p_category<>'memoria-ram' and t ~ '\m(combo|pc gamer|computadora|notebook|laptop|bundle)\M' then return null; end if;
 if p_category='procesadores' then
  chip:=public.catalog_chip(t,'cpu');
  if chip is null or chip[1] in ('unknown','ryzen') then return null; end if;
  if public.catalog_cpu_variant_attributes(t)->>'cooler'='conflict' then return null; end if;
  return jsonb_build_object('family',chip[1],'model',chip[2],'suffixes',replace(chip[3],' ','-'))||public.catalog_cpu_variant_attributes(t);
 elsif p_category='tarjetas-graficas' then
  chip:=public.catalog_chip(t,'gpu');
  brand:=(regexp_match(t,'\m(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|powercolor|gainward)\M'))[1];
  select v into series from unnest(array['aorus','strix','tuf','dual','prime','proart','eagle','windforce','gaming','ventus','shadow','suprim','trinity','phoenix','pulse','nitro','challenger','hellhound','red devil']) with ordinality a(v,n) where t ~ ('\m'||v||'\M') order by n limit 1;
  memory:=(regexp_match(t,'\mo?(\d{1,2})\s*gb\M'))[1];
  if chip is null or brand is null or series is null or memory is null then return null; end if;
  select coalesce(string_agg(v,'-' order by v),'') into edition from (select distinct x[1] v from regexp_matches(t,'\m(evo|advanced|ice|aero)\M','g') x) a;
  fans:=replace((regexp_match(t,'\m([1234]\s*x)\M'))[1],' ','');
  color:=(regexp_match(t,'\m(white|blanco|blanca|black|negro|negra)\M'))[1];
  color:=regexp_replace(regexp_replace(color,'blanc[oa]','white'),'negr[oa]','black');
  memory_type:=replace((regexp_match(t,'\m(gddr\s*[567]x?)\M'))[1],' ','');
  clock:=case when t ~ '\m(non|no|sin)\s*oc\M' then 'non-oc' when t ~ '\moc\M' then 'oc' else '' end;
  return jsonb_build_object('family',chip[1],'model',chip[2],'suffixes',replace(chip[3],' ','-'),'memory',memory,'brand',brand,'series',series,'edition',edition,'fans',coalesce(fans,''),'color',coalesce(color,''),'memoryType',coalesce(memory_type,''),'clock',clock);
 elsif p_category='memoria-ram' then
  brand:=replace((regexp_match(t,'\m(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|intel|amd|logitech|razer|hyperx|corsair|kingston|adata|patriot|crucial|gskill|hiksemi|klevv|steelseries|redragon|keychron|cooler\s*master|benq|aoc|viewsonic|samsung|lg|dell|hp|lenovo|team)\M'))[1],' ','');
  select v into series from unnest(array['impact','beast','vengeance','lancer','viper','venom','vulcan']) with ordinality a(v,n) where t ~ ('\m'||v||'\M') order by n limit 1;
  memory:=replace((regexp_match(t,'\m(\d{1,2}\s*gb)\M'))[1],' ','');
  generation:=(regexp_match(t,'\m(ddr[45])\M'))[1]; speed:=(regexp_match(t,'\m([2-8]\d{3})\s*(mhz|mt/s|mts)?\M'))[1];
  form:=case when t ~ '\m(sodimm|so\s*dimm|notebook|laptop)\M' then 'sodimm' when t ~ '\m(udimm|dimm|desktop)\M' then 'dimm' else null end;
  kit:=array_to_string(regexp_match(t,'\m(\d)\s*x\s*(\d{1,3})\s*gb\M'),'x');
  latency:=(regexp_match(t,'\mcl\s*(\d{2,3})\M'))[1]; color:=(regexp_match(t,'\m(white|blanco|blanca|black|negro|negra)\M'))[1];
  color:=regexp_replace(regexp_replace(color,'blanc[oa]','white'),'negr[oa]','black');
  if brand is null or series is null or memory is null or generation is null or speed is null or form is null or kit='' or kit is null or latency is null or color is null then return null; end if;
  select coalesce(string_agg(v,'-' order by v),'base') into variant from (
   select distinct x[1] v from regexp_matches(t,'\m(lpx|rs|pro|elite|sl)\M','g') x
   union select case when t ~ '\m(sin|no|non)[ -]?rgb\M' then 'non-rgb' when t ~ '\mrgb\M' then 'rgb' else null end
  ) a where v is not null;
  key:='ram:'||brand||':'||series||':'||memory||':'||generation||':'||speed||':'||form||':'||variant||':'||kit||':'||latency||':'||color;
  return jsonb_build_object('model',key);
 end if;
 return null;
end $$;

-- Contradicciones explícitas se rechazan también si una revisión antigua era positiva.
create or replace function public.catalog_explicit_offer_conflict(p_name text,p_category text,p_source text)
returns boolean language plpgsql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
declare a text:=public.catalog_identity_text(p_name); b text:=public.catalog_identity_text(p_source); left_chip text[]; right_chip text[]; left_attrs jsonb; right_attrs jsonb; key text; pattern text; av text; bv text;
begin
 if b ~ '\m(outlet|reacondicionado|usado|refurbished)\M' and a !~ '\m(outlet|reacondicionado|usado|refurbished)\M' then return true; end if;
 if p_category in ('procesadores','tarjetas-graficas') then
  left_chip:=public.catalog_chip(a,case when p_category='procesadores' then 'cpu' else 'gpu' end);
  right_chip:=public.catalog_chip(b,case when p_category='procesadores' then 'cpu' else 'gpu' end);
  if left_chip is not null and right_chip is not null and (left_chip[2]<>right_chip[2] or left_chip[3]<>right_chip[3]
   or (left_chip[1]<>'unknown' and right_chip[1]<>'unknown' and left_chip[1]<>right_chip[1]
    and not ((left_chip[1]='ryzen' or right_chip[1]='ryzen') and left_chip[1]~'^ryzen[3579]?$' and right_chip[1]~'^ryzen[3579]?$'))) then return true; end if;
 end if;
 if p_category='procesadores' then
  left_attrs:=public.catalog_cpu_variant_attributes(a); right_attrs:=public.catalog_cpu_variant_attributes(b);
  if left_attrs->>'cooler'='conflict' or right_attrs->>'cooler'='conflict' then return true; end if;
  foreach key in array array['packaging','cooler','condition'] loop
   if left_attrs->>key<>'' and right_attrs->>key<>'' and left_attrs->>key<>right_attrs->>key then return true; end if;
  end loop;
 end if;
 if p_category='tarjetas-graficas' then
  foreach pattern in array array['\m(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|powercolor|gainward)\M',
   '\m(aorus|strix|tuf|dual|prime|proart|eagle|windforce|gaming|ventus|shadow|suprim|trinity|phoenix|pulse|nitro|challenger|hellhound)\M',
   '\m(\d{1,4})\s*gb\M','\m(evo|advanced|ice|aero)\M','\m([1234]\s*x)\M'] loop
   av:=(regexp_match(a,pattern))[1]; bv:=(regexp_match(b,pattern))[1];
   if av is not null and bv is not null and av<>bv then return true; end if;
  end loop;
  left_attrs:=public.catalog_exact_offer_attributes(a,p_category); right_attrs:=public.catalog_exact_offer_attributes(b,p_category);
  if left_attrs is not null and right_attrs is not null then
   foreach key in array array['memory','brand','series','edition','fans','color','memoryType','clock'] loop
    if left_attrs->>key<>'' and right_attrs->>key<>'' and left_attrs->>key<>right_attrs->>key then return true; end if;
   end loop;
  end if;
 end if;
 if p_category='memoria-ram' then
  foreach pattern in array array['\m(corsair|kingston|adata|crucial|gskill|patriot|lexar|mushkin|teamgroup|team)\M',
   '\m(lpx|rs|beast|impact|redline|lancer|viper|venom|vulcan)\M','\mcl\s*(\d{2,3})\M','\m(\d{1,3})\s*gb\M',
   '\m(\d{4,5})\s*(mhz|mt\s*s)\M','\mddr\s*([345])\M'] loop
   av:=(regexp_match(a,pattern))[1]; bv:=(regexp_match(b,pattern))[1];
   if av is not null and bv is not null and av<>bv then return true; end if;
  end loop;
  av:=array_to_string(regexp_match(a,'\m(\d)\s*x\s*(\d{1,3})\s*gb\M'),'x'); bv:=array_to_string(regexp_match(b,'\m(\d)\s*x\s*(\d{1,3})\s*gb\M'),'x');
  if av<>'' and bv<>'' and av<>bv then return true; end if;
  if (a ~ '\mrgb\M' and a !~ '\m(sin|no|non)\s*rgb\M' and b ~ '\m(sin|no|non)\s*rgb\M')
   or (b ~ '\mrgb\M' and b !~ '\m(sin|no|non)\s*rgb\M' and a ~ '\m(sin|no|non)\s*rgb\M') then return true; end if;
 end if;
 return false;
end $$;

revoke all on function public.catalog_cpu_variant_attributes(text) from public;
grant execute on function public.catalog_cpu_variant_attributes(text) to anon,authenticated,service_role;
commit;
