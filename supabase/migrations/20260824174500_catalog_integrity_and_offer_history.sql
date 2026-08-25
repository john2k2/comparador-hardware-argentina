begin;

insert into public.categories (id, name, icon, slug)
values ('computadoras', 'Computadoras', 'monitor', 'computadoras')
on conflict (id) do update
set name = excluded.name,
    icon = excluded.icon,
    slug = excluded.slug,
    updated_at = now();

-- Las PCs completas deben quedar fuera de las categorias de componentes.
update public.products
set category = 'computadoras', updated_at = now()
where lower(name) ~ '(pc[[:space:]-]+(armad[oa]|gamer|completa|creadores)|computadora|desktop|workstation|notebook|laptop|all[[:space:]-]+in[[:space:]-]+one|netbook|chromebook)'
  and category <> 'computadoras';

update public.products
set category = 'computadoras', updated_at = now()
where lower(name) ~ '(combo|kit|bundle|paquete|\+)'
  and lower(name) ~ '(ryzen|core[[:space:]-]+i[3579]|procesador|cpu)'
  and lower(name) ~ '(rtx|gtx|radeon|geforce|mother|placa[[:space:]]+madre|ddr[45]|memoria[[:space:]]+ram|ssd|nvme|hdd)'
  and category <> 'computadoras';

-- Backfill determinista para filas historicas guardadas con la categoria de
-- la consulta del scraper en lugar de la categoria del titulo del producto.
update public.products
set category = 'procesadores', updated_at = now()
where category <> 'computadoras'
  and lower(name) ~ '(ryzen|core[[:space:]-]+i[3579]|procesador|cpu)'
  and category <> 'procesadores';

update public.products
set category = 'tarjetas-graficas', updated_at = now()
where category <> 'computadoras'
  and lower(name) ~ '(rtx|geforce|radeon|placa[[:space:]]+de[[:space:]]+video|(^|[^a-z])gpu([^a-z]|$))'
  and category <> 'tarjetas-graficas';

update public.products
set category = 'motherboards', updated_at = now()
where category <> 'computadoras'
  and lower(name) ~ '(motherboard|placa[[:space:]]+madre)'
  and category <> 'motherboards';

update public.products
set category = 'memoria-ram', updated_at = now()
where category <> 'computadoras'
  and lower(name) ~ '(ddr[45]|memoria[[:space:]]+ram|(^|[^a-z])ram([^a-z]|$))'
  and category <> 'memoria-ram';

update public.products
set category = 'almacenamiento', updated_at = now()
where category <> 'computadoras'
  and lower(name) ~ '(ssd|nvme|(^|[^a-z])hdd([^a-z]|$))'
  and category <> 'almacenamiento';

alter table public.price_history
  add column if not exists offer_url text null;

create index if not exists price_history_offer_idx
  on public.price_history (product_id, store_id, offer_url, recorded_at desc);

create or replace function public.cleanup_price_history(
  retain_recent interval default interval '14 days',
  retain_hourly interval default interval '90 days',
  retain_daily interval default interval '365 days'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  executed_at timestamptz := now();
  recent_cutoff timestamptz := executed_at - retain_recent;
  hourly_cutoff timestamptz := executed_at - retain_hourly;
  daily_cutoff timestamptz := executed_at - retain_daily;
  before_rows bigint := 0;
  remaining_rows bigint := 0;
  deleted_rows bigint := 0;
begin
  if retain_recent <= interval '0' or retain_hourly <= interval '0' or retain_daily <= interval '0' then
    raise exception 'cleanup_price_history intervals must be positive';
  end if;
  if not (retain_recent < retain_hourly and retain_hourly < retain_daily) then
    raise exception 'cleanup_price_history requires retain_recent < retain_hourly < retain_daily';
  end if;

  select count(*) into before_rows from public.price_history;
  with ranked as (
    select ph.id, ph.recorded_at,
      row_number() over (
        partition by ph.product_id, ph.store_id, coalesce(ph.offer_url, ''), date_trunc('hour', ph.recorded_at)
        order by ph.recorded_at desc, ph.id desc
      ) as hourly_rank,
      row_number() over (
        partition by ph.product_id, ph.store_id, coalesce(ph.offer_url, ''), date_trunc('day', ph.recorded_at)
        order by ph.recorded_at desc, ph.id desc
      ) as daily_rank
    from public.price_history ph
  ), deleted as (
    delete from public.price_history ph
    using ranked
    where ph.id = ranked.id
      and (
        ranked.recorded_at < daily_cutoff
        or (ranked.recorded_at < hourly_cutoff and ranked.recorded_at >= daily_cutoff and ranked.daily_rank > 1)
        or (ranked.recorded_at < recent_cutoff and ranked.recorded_at >= hourly_cutoff and ranked.hourly_rank > 1)
      )
    returning 1
  )
  select count(*) into deleted_rows from deleted;
  select count(*) into remaining_rows from public.price_history;

  return jsonb_build_object(
    'deletedRows', deleted_rows,
    'beforeRows', before_rows,
    'remainingRows', remaining_rows,
    'policy', jsonb_build_object(
      'keepRawDays', extract(day from retain_recent)::int,
      'keepHourlyDays', extract(day from retain_hourly)::int,
      'keepDailyDays', extract(day from retain_daily)::int
    ),
    'executedAt', executed_at
  );
end;
$$;

comment on column public.price_history.offer_url
is 'URL normalizada de la oferta; separa variantes de una misma tienda en el historial.';

commit;
