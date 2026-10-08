# Componentes a 20 h — aplicada en producción

`catalog_refresh_policy` daba 24 h a componentes y productos con interés, y `claim_catalog_refresh` sólo reclama ofertas con `last_updated <= now() - interval_hours`. Una oferta volvía a la cola recién cuando ya había salido de la ventana de 24 h que mide la cobertura.

[`20261008231520_adaptive_component_window_20h.sql`](../../../supabase/migrations/20261008231520_adaptive_component_window_20h.sql) recrea la vista igual que `20261001191058_persist_adaptive_observations.sql`, salvo esas dos líneas (24 → 20). Las RPC de reclamo no cambian: 20 h sigue dentro del grupo `<= 24`, delante del mantenimiento. `within_policy` de `catalog_refresh_coverage` pasa a medirse contra 20 h; `observed_24h` no cambia.

[`supabase/tests/adaptive_component_window.sql`](../../../supabase/tests/adaptive_component_window.sql) se probó en PostgreSQL 17 local con bootstrap y todas las migraciones: una oferta de 21 h se reclama y una de 19 h no; mantenimiento, seguimiento y permisos se conservan. Corre en `verify.yml`.

Aplicada el 08/10/2026 a las 23:15 UTC con autorización de Jonathan, versión `20261008231520`. Antes de aplicarla, la vista de producción coincidía por md5 con la local; después coincide con la nueva. Sigue privada: `anon` y `authenticated` no la leen, `service_role` sí.
