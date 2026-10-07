# Revisión independiente F1 — 07/10/2026

Comparador reviewer, Sol/high, lectura sobre HEAD527 y diff de búsqueda. Sin hallazgos materiales. La caché se invalida al perder ofertas elegibles o cambiar su mínimo actual; los históricos opt-in se conservan. La guarda posterior a demanda evita un hit que venza durante ese await. Recuperación por SQL con parámetros, totales, orden y página intactos; sin filtrar una página ya paginada ni loops.

Se contrastaron reader, mapper y search_catalog_page/catalog_current_price_stats: mínimo de ofertas actuales, conversión Number sin redondeo. No se halló normalización que cause misses sistemáticos. Inconsistencias SQL/mapper pueden causar miss conservador; su frecuencia y costo no están medidos.

Límites: página vacía conserva snapshot; F1 no revalida DB después de esperas posteriores ni cambios de tienda aún no observados. F2 necesita guarda por consumidor. Revisor no ejecutó pruebas, HTTP, DB o Git. Coordinador conserva pruebas focales15/15 y hashes antes de integrar.

| Fuente | SHA-256 revisado |
|---|---|
| search-handler-shared.ts | 24f4274605d2b8d57a43158dfc3fdb816e98ed7dca701e80edb81906bf8e2261 |
| search-route-handler.ts | 403281b16246bfda75f34c5629566d056c804c8412dc10ca882dc59f9d38b196 |
| src/app/api/search/route.test.ts | 9acba26559ba443e9f5f7860be085df548d064bc8f149f497455591bd167d7ff |
