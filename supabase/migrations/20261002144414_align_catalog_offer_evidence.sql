-- Atributos exactos reproducibles; sin confianza inventada ni umbral Jev reducido.
begin;
create or replace function public.catalog_exact_offer_attributes(p_name text,p_category text)
returns jsonb language plpgsql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
declare t text:=public.catalog_identity_text(p_name); chip text[]; brand text; series text; edition text; fans text; color text; memory_type text; clock text; memory text; key text; form text; variant text; kit text; latency text; speed text; generation text; packaging text;
begin
 if p_category<>'memoria-ram' and t ~ '\m(combo|pc gamer|computadora|notebook|laptop|bundle)\M' then return null; end if;
 if p_category='procesadores' then
  chip:=public.catalog_chip(t,'cpu');
  if chip is null or chip[1] in ('unknown','ryzen') then return null; end if;
  select coalesce(string_agg(v,'-' order by v),'') into packaging from (select distinct x[1] v from regexp_matches(t,'\m(box|tray|oem)\M','g') x) a;
  return jsonb_build_object('family',chip[1],'model',chip[2],'suffixes',replace(chip[3],' ','-'),'packaging',packaging);
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
revoke all on function public.catalog_exact_offer_attributes(text,text),public.catalog_explicit_offer_conflict(text,text,text),public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text) from public;
grant execute on function public.catalog_exact_offer_attributes(text,text),public.catalog_explicit_offer_conflict(text,text,text),public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text) to anon,authenticated,service_role;
commit;
