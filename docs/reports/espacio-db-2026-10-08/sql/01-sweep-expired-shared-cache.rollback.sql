-- Reversión del borrador 01. Quita la función; NO restaura filas ya barridas
-- (eran entradas vencidas que getSharedCache ya trataba como ausentes).
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.sweep_expired_shared_cache(timestamptz, integer);
COMMIT;
