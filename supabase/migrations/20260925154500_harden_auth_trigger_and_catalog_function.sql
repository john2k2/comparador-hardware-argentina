-- El trigger de Auth no se invoca desde la API publica.
-- La funcion de timestamp tampoco debe resolver nombres desde un search_path mutable.
begin;

revoke execute on function public.handle_new_user()
from public, anon, authenticated;
grant execute on function public.handle_new_user()
to supabase_auth_admin;

alter function public.set_catalog_updated_at()
set search_path = pg_catalog, public;

commit;
