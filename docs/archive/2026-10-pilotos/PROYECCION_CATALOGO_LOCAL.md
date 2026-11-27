# Proyección de lectura del catálogo local

`scripts/pilots/cloudflare-catalog/projection.mjs` precalcula estadísticas por
producto, preferencia de identidad y próxima transición del reloj en SQLite
offline. `rebuildProjection(db,{now,generation,affectedProductIds})` es síncrono;
el caller controla la transacción. Sin IDs construye el corte completo; con IDs
incluye afectados, pares de identidad y vencimientos. No cambia fechas de ofertas.

`searchCatalog` usa la proyección sólo dentro del intervalo certificado y sin
filtro de tienda. Si falta o vence, usa el SQL original. Conserva las fichas
vencidas de una identidad activa para respetar la selección canónica PostgreSQL.
Filtra identidades activas antes del matcher y usa índice parcial para precio.

Validación local: seis tests de contrato, caducidad exacta, delta, rollback,
no-op y fecha futura/reloj hacia atrás. En el catálogo completo, 50 consultas
coincidieron con el oráculo PostgreSQL del mismo corte. No se midió CPU remota.

Reversión: retirar `projection.mjs`, `projection.sql`, sus tests y los cambios
de selección de proyección en `engine.mjs`; el SQL original sigue disponible.
La CLI de mantenimiento y la caché son integraciones posteriores separadas.
