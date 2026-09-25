-- Las RPC de mantenimiento se invocan desde el servidor con service_role.
-- SECURITY DEFINER no debe quedar ejecutable por anon ni authenticated.
begin;

revoke execute on function public.check_api_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.check_api_rate_limit(text, integer, integer)
to service_role;

revoke execute on function public.cleanup_price_history(interval, interval, interval)
from public, anon, authenticated;
grant execute on function public.cleanup_price_history(interval, interval, interval)
to service_role;

commit;
