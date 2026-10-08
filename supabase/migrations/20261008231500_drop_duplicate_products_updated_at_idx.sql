-- Duplicado exacto de products_updated_at_desc_idx (btree updated_at DESC), sin uso desde
-- mayo de 2026. En producción se borró con DROP INDEX CONCURRENTLY fuera de transacción.
drop index if exists public.products_updated_at_idx;
