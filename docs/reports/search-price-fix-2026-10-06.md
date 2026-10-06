# Búsqueda general por precio · corrección y verificación

Corte del 06/10/2026 UTC, 05/10 en Santiago. La cancelación de `search_catalog_page` en la búsqueda general por precio está corregida en la base pública. La interfaz candidata continúa sin publicarse en el dominio principal.

## Problema y cambio

La ruta `/api/search?minPrice=100000&sortBy=price-asc` había devuelto 503 tras aproximadamente 8,9 segundos. La consulta anterior agotó nuevamente su límite de ocho segundos durante este diagnóstico, incluso después de añadir los índices. Una respuesta desde la caché de búsqueda no se usó como prueba de recuperación.

El recorrido sin texto ni filtro de tienda y con un límite de precio parte ahora de los resúmenes con observaciones comparables dentro de 24 horas. Dos índices permiten seleccionar esos candidatos y comprobar su identidad canónica. La elección canónica sigue ocurriendo antes de filtrar precio y frescura: una copia reciente no sustituye a la ficha agrupada preferida si ésta tiene precios vencidos.

Se mantienen el helper que recalcula ofertas vencidas, el total exacto, el orden, los límites de página y la carga de sus ofertas. Las ramas de búsqueda por texto, por tienda y de referencias históricas conservan su definición anterior. La función sigue siendo `SECURITY INVOKER`, con los mismos permisos y límite de ocho segundos.

Esta corrección cambia índices y lectura SQL. No renueva precios, stock, identidad ni fechas de observación. La ventana del catálogo sigue siendo de 24 horas; guías y armador conservan su ventana independiente de tres horas.

Migraciones aplicadas y registradas en Supabase:

- `20261006013845_current_catalog_price_read_indexes.sql`.
- `20261006014216_current_catalog_price_fastpath.sql`.

El plan analizado de la nueva lectura terminó en 3.540,671 ms; la RPC activada devolvió el mismo JSON medido en 3.038 ms. En ese corte, el rango desde ARS 100.000 tenía 1.593 productos y 133 páginas. Son cifras fechadas del catálogo, no un total congelado.

## Controles repetidos con esta corrección

| Control | Resultado | Alcance |
|---|---|---|
| RPC anónima directa, sin caché de respuesta HTTP | 15/15; máximo 3.763 ms | Consulta original, página 2, precio inverso, ambos límites, máximo solo, orden por nombre/fecha/relevancia, CPU/GPU/RAM, tienda, texto y vacío. |
| Matriz HTTP sobre el Worker candidato con catálogo real | 32/32 | El fallo general anterior queda resuelto; incluye las dos protecciones de escáner del runtime. No todas sus respuestas son frías. |
| Navegador del candidato con catálogo real | 2/2 | Escritorio y 390 px: rango general, orden, total, paridad API/tarjetas, cambio a página 2 sin duplicados ni desbordamiento. |
| Reconstrucción SQL desde PostgreSQL 17 vacío | 72 migraciones, 16 suites y 2 concurrencias aprobadas | Incluye las migraciones nuevas y la incorporación de su regresión a CI. |
| Equivalencia SQL contra la función anterior | 15 comparaciones exactas aprobadas | Se compara el JSON completo, incluidos productos, ofertas, orden, total y paginación. |
| Fixtures de límites de elegibilidad | 271 productos esperados comprobados | 270 recientes y uno mixto; excluye el grupo vencido y su copia, fechas futuras y stock desconocido. Recalcula ARS 150.000, conserva ARS 50.000 histórico y su fecha. También funciona como `anon`. |
| TypeScript, lint y sintaxis de los nuevos controles | Aprobados | No se modificó código de aplicación en este corte. |
| TestSprite TC031, replay estricto con catálogo real | 1/1 aprobada, autocorrección deshabilitada | Worker candidato QA de sólo lectura; API fría desde su navegador, ocho segundos como máximo, orden y paridad de tarjetas/página 2. Separado del 30/30 sintético anterior. |

`DB-STALE` indica lectura de base con referencias envejecidas en las ofertas devueltas; no equivale a `HIT-STALE` ni a servir una respuesta de búsqueda guardada. La matriz directa usa POST de RPC y `no-store`: cada consulta se ejecuta en la base, aunque sus buffers internos puedan estar calientes.

El corte anterior conserva 30/30 TestSprite y 414/414 navegador en QA sintético. No se volvió a ejecutar todo ese lote por un cambio exclusivo de SQL. Los resultados de RAM vacíos no acreditan agotamiento; esta corrección no cierra G02 ni los controles de cobertura e identidad.

## Reproducir y revertir

`scripts/validate-global-price-search.mjs` usa exclusivamente URL y clave pública del catálogo. Ejecutar con `PUBLIC_CATALOG_ENV_FILE` apuntando al archivo local ignorado de configuración pública; nunca necesita una clave de servicio. Conserva una separación de un segundo entre lecturas y escribe `direct-rpc-matrix.json`.

`scripts/test-current-catalog-prices.mjs` acepta únicamente PostgreSQL local y una base `catalog_*`. Obtiene la función de referencia de la migración inmutable `20261002155711_activate_current_catalog_reads.sql`, crea una copia local, prueba fixtures en una transacción revertida y elimina la copia al terminar. CI lo ejecuta después de `current_offer_evidence.sql`.

El recorrido de navegador se reproduce con `PUBLIC_QA_ORIGIN=http://127.0.0.1:3105 npx playwright test --config=playwright.public.config.ts e2e-public/global-price-search.spec.ts`. Es de lectura y bloquea Google; no solicita refresh, pulsa tiendas, afiliados o envía formularios.

Para revertir solamente esta lectura, preparar una nueva migración que restaure el cuerpo de `search_catalog_page` de `20261002155711_activate_current_catalog_reads.sql`, conservando permisos y configuración, y vuelva a comprobar los contratos. Los dos índices nuevos pueden retirarse después; no borrar resúmenes ni modificar ofertas. No se ejecutó la reversión: reintroduciría la consulta lenta conocida.

Los scripts de prueba y su documentación constituyen una segunda unidad de revisión; pueden retirarse sin cambiar la función pública. Publicar la interfaz es una acción separada de las dos migraciones de base que ya quedaron aplicadas.

## Evidencia

En `outputs/search-price-fix-2026-10-06/`: `diagnosis.json`, `direct-rpc-matrix.json`, `public-http-final/public-site.json`, `database-fresh-replay.json`, `database-fresh-replay.log`, `database-fastpath-fixtures.log`, `browser.log` y las dos capturas `browser/*/global-price-page-2.png`. `testsprite-final-sanitized.json` y `summary.json` registran la verificación final sin enlaces firmados ni datos de cuenta.

Los errores de preparación de la prueba se conservan: un túnel no admite replay estricto; cambiar metadatos dejó el código desactualizado y hubo que volver a registrarlo. Tanto la petición HTTP remota como el navegador de TestSprite recibieron 403 «Just a moment…» en el dominio principal. La corrida final `744c6f43-3480-4ec7-9f2a-557f6b5dd12d` pasó a las 02:07:49 UTC en `https://hardware-ar-price-qa-20261006.ortiz-jonathan.workers.dev`, versión `0c520002-374c-4e14-ae8e-5076bd393316`, con el mismo candidato y la base real. Es evidencia de ese entorno, no del navegador remoto sobre el dominio principal. La lectura directa y los controles locales prueban la RPC real sin depender del desafío. QA tiene `noindex`, cron vacío, refresh deshabilitado, claves privadas vacías y POST/refresh bloqueados. Ningún fallo anterior se convierte retroactivamente en aprobado y no se habilitó autocorrección.

Referencias primarias para el diagnóstico: [EXPLAIN de PostgreSQL](https://www.postgresql.org/docs/current/using-explain.html) y [materialización de consultas WITH](https://www.postgresql.org/docs/current/queries-with.html). La mejora declarada procede de las mediciones guardadas, no del coste estimado del plan.
