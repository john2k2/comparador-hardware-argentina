begin;

insert into public.categories (id, name, icon, slug, parent_category)
values ('perifericos', 'Perifericos', 'keyboard', 'perifericos', null)
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  slug = excluded.slug,
  parent_category = excluded.parent_category,
  updated_at = now();

update public.products
set
  category = 'perifericos',
  updated_at = now()
where category in ('tarjetas-graficas', 'procesadores')
  and name ~* '(mouse|teclad|keyboard|monitor|auricular|headset|headphone|parlante|speaker|microfono|webcam|joystick|gamepad|mousepad|alfombrilla|logitech|razer|redragon|steelseries|keychron)'
  and name !~* '(rtx|gtx|rx[[:space:]]*[0-9]{3,4}|radeon|geforce|ryzen|core[[:space:]]*i[3579]|mother|placa[[:space:]]*madre|ddr4|ddr5|ssd|nvme|hdd|fuente|gabinete|cooler|ventilador)';

commit;
