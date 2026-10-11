# Búsqueda local con Worker y D1 — 11/10/2026

Estado: piloto local ejecutable con datos públicos reales. No se creó D1 remoto,
no se publicó un Worker y la página pública conserva su implementación existente.
Este documento no constituye una decisión de migración.

## Datos y contrato

La captura pública terminó entre 05:06:55 y 05:10:51 UTC: 59.692 productos,
73.827 registros de precio, 57.548 resúmenes y 34 tiendas. Las páginas REST se
leyeron consecutivamente: no fue una transacción atómica de producción. PostgreSQL
local y SQLite comparan la misma copia congelada y un mismo reloj de referencia.

El coordinador derivó `certified-snapshot` tras comprobar la elegibilidad con las
funciones reales de PostgreSQL. Excluyó una oferta del resumen comparable cuya
URL describía otra variante. Los registros originales y el historial conservan
su contenido; la corrección es local y no se aplicó a producción.

`engine.mjs` devuelve el JSON de `public.search_catalog_page`: mismo filtrado,
preferencia de identidad, estadísticas, orden y paginación. Conserva los campos
originales de cada producto y oferta. La respuesta no es todavía un reemplazo
de la API pública Next.js: falta su mapper y sus guardas de categoría/identidad.
No cambia rutas, autenticación ni configuración del Worker publicado.

Las ofertas comparables del resumen conservan identidad y stock admitidos por
PostgreSQL. El lector evalúa 24 horas y la tolerancia futura de un minuto; no
actualiza `last_updated`. RAM, firma de GPU/CPU, kits y señales de portátil usan
el matcher portado y contrastado contra PostgreSQL. Los históricos se mantienen
cuando el contrato los admite; un rango de precio, incluido mínimo cero,
solicita ofertas actuales antes de totales/paginación.

El prefiltro FTS5 trigram respeta subcadenas, incluido `6000` dentro de `6000mhz`.
Cada bloque de texto procesa hasta 2.000 candidatas y sigue hasta agotarlas. No
devuelve un total truncado. El presupuesto de 44 bloques reserva las demás
lecturas para mantenerse dentro de 50 consultas por invocación; si no completa
la búsqueda devuelve 503 `CATALOG_CANDIDATE_BUDGET_EXCEEDED`.

## Ejecutar en la Mac

Requiere Node con `node:sqlite` (ensayo ejecutado con Node 26.5.0), dependencias
del checkout y la captura pública existente. El importador valida nombres,
conteos, página final y SHA256 antes de crear una base. Rechaza destinos
existentes y campos privados en las filas exportadas.

```sh
node scripts/pilots/cloudflare-catalog/import-local.mjs \
  outputs/catalogo-local-cloudflare-2026-10-11/certified-snapshot \
  outputs/catalogo-local-cloudflare-2026-10-11/nueva-copia.sqlite \
  outputs/catalogo-local-cloudflare-2026-10-11/nueva-copia.d1.sql

node_modules/.bin/wrangler d1 execute CATALOG_DB --local \
  --config scripts/pilots/cloudflare-catalog/wrangler.local.jsonc \
  --persist-to outputs/catalogo-local-cloudflare-2026-10-11/d1-local \
  --file outputs/catalogo-local-cloudflare-2026-10-11/nueva-copia.d1.sql

node_modules/.bin/wrangler dev --local \
  --config scripts/pilots/cloudflare-catalog/wrangler.local.jsonc \
  --persist-to outputs/catalogo-local-cloudflare-2026-10-11/d1-local \
  --port 8797
```

La base existente ya está importada: para abrir la prueba sólo hace falta el
último comando. Reimportar el esquema en esa misma base fallará; usar otro
directorio de persistencia para una nueva prueba. Abrir `http://127.0.0.1:8797/`.
El ID D1 es ficticio y la configuración desactiva los bindings remotos. No usar
estos comandos con `--remote`, ni ejecutar deploy/create/upload.

PostgreSQL de este ensayo usa un socket privado y no escucha TCP. Para detener
o reiniciar exclusivamente ese proceso, usar `node
scripts/pilots/cloudflare-catalog/snapshot-postgres.mjs --stop` o el mismo
comando con `--start`. Su directorio de datos es temporal; el snapshot exportado
permanece en `outputs` y permite reconstruirlo si macOS elimina ese directorio.
No es un servicio completo de Supabase ni un servidor público.

La UI permite consulta, categoría, tiendas, rangos, orden y paginación. La tabla
señala registros históricos o sin validación vigente y muestra fechas reales.
Los enlaces son fuentes del registro, no una nueva comprobación de stock. La
evidencia opcional de ofertas se devuelve fuera del JSON RPC para conservar su
paridad exacta.

```sh
node --test scripts/pilots/cloudflare-catalog/engine.test.mjs \
  scripts/pilots/cloudflare-catalog/worker.test.mjs \
  scripts/pilots/cloudflare-catalog/catalog-matchers.test.mjs \
  scripts/pilots/cloudflare-catalog/snapshot-verify.test.mjs
```

Para reproducir también las dos comprobaciones del corpus/SQL sin omitirlas,
definir `CATALOG_MATCHER_SNAPSHOT_PRODUCTS` con la ruta absoluta a
`certified-snapshot/products.jsonl`, `CATALOG_MATCHER_PG_SOCKET` con el campo
`socket` de `public-snapshot/postgres-state.json`, y
`CATALOG_MATCHER_PG_PORT=55527`. Son rutas del ensayo local, no credenciales ni
destinos remotos. Con ellas la ejecución de cierre pasó 15/15 pruebas sin skips.

Las pruebas del motor verifican caducidad, fecha futura, identidad canónica
vencida, variantes, tiendas, unidades RAM, paginación y rechazo de parámetros.
El test de 240 caracteres y 80 términos exige menos de 100 bindings por
sentencia, con un único JSON de términos. Las pruebas del Worker comprueban
health con marcador, sin marcador y con error de base, además de rechazar
rutas, métodos y parámetros inválidos antes de acceder a D1.
La prueba de SHA rechaza una alteración que conserva el número de filas. La
matriz de paridad completa y los checks de integridad los genera el coordinador
en `outputs/catalogo-local-cloudflare-2026-10-11/`.

La última matriz del coordinador pasó **46 de 46 casos con JSON completo**
contra PostgreSQL local del snapshot certificado. Los checks de integridad
pasaron **11 de 11**. Es evidencia de ese corpus congelado, no una garantía
de todos los posibles términos futuros ni de una captura remota atómica.

Se reinició únicamente el Worker del piloto, conservando D1 y sus datos. La
primera solicitud de búsqueda tras el reinicio devolvió 12 productos RTX en
449,6 ms; repetida, 105,4 ms. Ryzen 5500 tomó 51,3 ms y Logitech con ofertas
actuales 240,7 ms. El rango global tomó 1.405,0 ms y 378.519 filas leídas en
ese último corte. `cold-start-runtime.json` registra todos los casos, además de
las filas leídas y el orden exacto. No se purgó la caché de disco/SQLite del
sistema ni se midió CPU facturada en Cloudflare; no es una prueba de inicio
en frío de la infraestructura remota.

## Capacidad y costo cero: condiciones todavía abiertas

La representación compacta inicial mide **389.226.496 bytes**. El D1 local
certificado final, con los dos índices temporales y el delta, mide
**393.900.032 bytes**, sin WAL pendiente. Cabe por debajo del límite de 500 MB;
el margen debe volver a medirse tras futuras cargas y crecimiento. El modelo
no incluye cuentas, favoritos, alertas ni historial.

Los dos índices añadidos después de la primera importación están representados
en `scripts/pilots/cloudflare-catalog/schema.sql`: `summaries_current_idx` sobre
`(comparable_latest_observed_at, product_id)` y `summaries_valid_idx` sobre
`(comparable_valid_until, product_id)`, este último con la condición
`comparable_stats_json IS NOT NULL`. Toda nueva copia generada con el importador
y el esquema vigentes los incluye desde el inicio.

El archivo histórico `catalog-search-compact.d1.sql` y la primera SQLite se
generaron antes de añadirlos. Para reproducir el esquema final partiendo de ese
archivo antiguo, aplicar después de cargarlo y antes de medir, únicamente en
D1 local, el mismo DDL que se ejecutó durante el ensayo:

```sql
CREATE INDEX IF NOT EXISTS summaries_current_idx
  ON summaries(comparable_latest_observed_at, product_id);
CREATE INDEX IF NOT EXISTS summaries_valid_idx
  ON summaries(comparable_valid_until, product_id)
  WHERE comparable_stats_json IS NOT NULL;
ANALYZE;
```

El delta certificado se aplica después de importar los datos originales. Los
393.900.032 bytes son la medición de la copia D1 del ensayo después de esos pasos;
el tamaño físico puede variar entre versiones de SQLite y al crear los índices
antes o después de insertar las filas. La reproducción exige el mismo esquema,
datos y resultados, no una igualdad de bytes del archivo.

El bootstrap requiere **369.228 inserciones base**, sin contar escrituras de
índices Btree/FTS. Wrangler local ejecutó 369.242 sentencias, todas exitosas.
La cuota gratuita remota de 100.000 filas escritas/día impide cargarlo como una
sola operación dentro de un día. El mínimo matemático son cuatro días para las
filas base; no es una estimación del plazo real con índices. El ensayo local
no consume esa cuota y no demuestra que una importación remota pueda ignorarla.

Preparación necesaria antes de autorizar un bootstrap remoto:

1. Congelar un snapshot certificado y dividir el SQL en lotes deterministas,
   con manifiesto y checkpoints. No truncar productos para simular cobertura.
2. Medir `rows_written` real, incluidos índices/FTS, y reservar un presupuesto
   por día por debajo de la cuota compartida. Un número de sentencias no
   equivale a filas facturadas; todavía no existe esa medición remota.
3. Mantener el marcador de snapshot ausente durante la carga. El Worker responde
   503 hasta completar la importación, para no ofrecer totales parciales.
4. Reconciliar ofertas recientes al terminar: el bootstrap de varios días no
   puede presentar como actuales las fechas de la captura inicial.
5. Aplicar después sólo deltas reales, con la misma certificación, y medir su
   consumo diario. No reemplazar toda la copia cada 24 horas.

`delta-local.mjs` valida ambos manifiestos y aplica un cambio acotado a los
campos comparables de resúmenes y a su basis actual. Rechaza cambios de productos,
tiendas, precios originales e históricos. La exclusión de la oferta incorrecta
se aplicó a SQLite y D1 local con **7 escrituras base**, sin contar índices. Es
una demostración de delta, no un sincronizador completo de producción.

La cuota gratuita de lecturas es 5 millones de filas/día. El último corte local
se registra en `cold-start-runtime.json`; el corte previo está en
`worker-local-runtime-final.json`. Consultas específicas del último corte
leyeron 9.497–53.313 filas; RTX amplio 107.866 y el rango global 378.519. El
costo varía al caducar estadísticas y recalcular ofertas. Con el costo observado
del rango, trece solicitudes sin caché consumirían casi toda la cuota diaria,
antes de considerar otras rutas. Hace falta definir y verificar caché,
invalidación y un modelo de lectura más barato antes de cambiar producción.

Workers Free permite 10 ms de CPU por solicitud. `Server-Timing` y tiempo HTTP
local miden duración, no CPU facturada. Wrangler local tampoco prueba el
cumplimiento del límite remoto. Ese gate permanece abierto. La capa actual
realiza varias lecturas: una actualización concurrente no es una transacción
de snapshot. Una integración pública necesita versión/generación consistente
del catálogo y conservación del comportamiento observable de errores.
D1 admite hasta 100 parámetros por consulta. Guards y scoring usan una CTE
`query_terms` con un único JSON, de modo que añadir términos no añade bindings.
El test extremo de 240 caracteres y 80 términos conserva menos de 25 bindings
por sentencia; las entradas inválidas continúan rechazándose explícitamente.
Un error de base no equivale a una búsqueda sin productos.

Fuentes oficiales consultadas el 11/10/2026:
[límites D1](https://developers.cloudflare.com/d1/platform/limits/),
[cuotas y facturación D1](https://developers.cloudflare.com/d1/platform/pricing/),
[índices y trigram](https://developers.cloudflare.com/d1/best-practices/use-indexes/),
[importación y transacciones](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[desarrollo local](https://developers.cloudflare.com/d1/best-practices/local-development/),
[límites Workers](https://developers.cloudflare.com/workers/platform/limits/).

Próxima decisión del coordinador: aceptar este ensayo como prueba local del
contrato y continuar con presupuesto de lectura/escritura e invalidación. No
publicar esta representación mientras esos gates y la integración de guardas
de la aplicación sigan pendientes.
