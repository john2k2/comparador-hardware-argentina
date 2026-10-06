-- Historial privado y autorizaciones cifradas del panel administrativo.
-- No modifica la caché, el catálogo ni los permisos de otras tablas.
create table public.measurement_dashboard_entries (
  entry_key text primary key check (length(entry_key) between 1 and 180),
  scope text not null check (scope in ('measurement-dashboard-v1', 'measurement-dashboard-v1:history', 'measurement-dashboard-v1:credentials')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index measurement_dashboard_entries_scope_updated_idx
  on public.measurement_dashboard_entries (scope, updated_at desc);

alter table public.measurement_dashboard_entries enable row level security;
revoke all on public.measurement_dashboard_entries from public, anon, authenticated;
grant select, insert, update, delete on public.measurement_dashboard_entries to service_role;
create policy measurement_dashboard_service_only
  on public.measurement_dashboard_entries for all to service_role
  using (true) with check (true);

comment on table public.measurement_dashboard_entries is
  'Datos de seguimiento privados. Acceso exclusivo del servidor tras verificar administrador. Credenciales cifradas; sin vencimiento ni dependencia de limpiezas de caché.';
