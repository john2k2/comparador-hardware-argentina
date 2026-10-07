# Lectura estrecha para preparar la cola

Dos índices generales permiten leer identidad/categoría sin payload cuando PostgreSQL puede usar index-only scans. Cubren también productos excluidos de componentes. La función seed y su contrato se conservan: invoker, permisos, máximo 500 escrituras, 200 lotes del caller, categoría, leases y reintentos.

Migración `20261007023548_catalog_seed_covering_indexes.sql`: transacción con `lock_timeout=2s` y `statement_timeout=30s` locales a esa DDL. Si falla, revierte ambos índices. No eleva límites de roles o servidor.

Harness: PG 17.11 aislado, 59.160 productos/73.291 ofertas sintéticos; replay cronológico de las 76 migraciones. Los 14 archivos SQL de CI pasaron; `catalog-concurrency.test.mjs`, 3/3. La regresión comprueba 501/500/1/0, categorías discrepantes, fuentes/mantenimiento, permisos y conservación de reservas. Un lock sobre una categoría distinta sigue dando error; no se oculta con SKIP LOCKED.

En cola completa y páginas visibles, los bloques leídos/consultados pasan de 19.661 a 1.637. Con cambios en ambas tablas, no se obtiene ese beneficio. Con cambios sólo en productos, 21.625 a 14.430. Los tiempos locales no representan el servidor real ni su p95. Los índices sumaron 7.290.880 bytes en el sintético; el costo real de mantenimiento no está medido.

**Aplicación remota pendiente.** El corte de capacidad confirma plan Free y 926.215.315 bytes de base. Esta unidad queda preparada, pero la recomendación de aplicar primero los índices se suspende hasta resolver capacidad y retención. Ver `capacidad.json` y el informe general. No se aplicaron migraciones remotas.

Comandos, planes, límites y fallos de ensayo: `seed-local.md`, `seed-benchmark-summary.json`, `seed-benchmark-churn.json`, `seed-benchmark-mixed.json`. La instancia propia fue detenida tras la verificación.

Reversión local: retirar migración/test SQL, el caso concurrente nuevo y su línea CI. Si se aplica después de autorización, retirar únicamente los dos índices mediante otra migración revisada; no eliminar cola, ofertas o historial. El despliegue de los lectores y diagnóstico no requiere estos índices.
