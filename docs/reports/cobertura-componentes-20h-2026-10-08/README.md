# Componentes a 20 h — migración pendiente de autorización

`catalog_refresh_policy` da 24 h a componentes y productos con interés, y `claim_catalog_refresh` sólo reclama ofertas con `last_updated <= now() - interval_hours`. Una oferta vuelve a la cola recién cuando ya salió de la ventana de 24 h que mide la cobertura.

`20261008220500_adaptive_component_window_20h.sql` recrea la vista igual que `20261001191058_persist_adaptive_observations.sql`, salvo esas dos líneas (24 → 20). Las RPC de reclamo no cambian: 20 h sigue dentro del grupo `<= 24`, delante del mantenimiento. `within_policy` de `catalog_refresh_coverage` pasa a medirse contra 20 h; `observed_24h` no cambia.

`adaptive_component_window.sql` se probó en PostgreSQL 17 local con bootstrap y todas las migraciones: una oferta de 21 h se reclama y una de 19 h no; mantenimiento, seguimiento y permisos se conservan.

Queda fuera de `supabase/migrations` hasta que Jonathan autorice aplicarla en remoto. El código del runner funciona igual con la vista de 24 h.
