# Espacio de la base: borradores para caché, amplificación de escritura e índices

**Preparación local, sin conexión a Supabase remoto.** Rama `codex/optimizacion-scraping-web`, worktree `comparador-optimizacion`. No se aplicó nada en producción, no se publicó, no se tocó `src/**` ni `supabase/migrations`. Los SQL viven en [`sql/`](sql/) porque el proyecto mantiene fuera de migraciones los cambios de base no aprobados. Las cifras de producción son **cortes anteriores** (07/10/2026), citados con su fuente; ninguna es una medición nueva.

## TL;DR

La base ronda 937–938 MB contra un presupuesto Free de 500 MB. **Ningún paquete de este informe cierra esa brecha.** Lo único que reduce el tamaño físico de inmediato es retirar índices; el resto frena el crecimiento o deja filas reutilizables que no achican el archivo.

| # | Operación | MB que podría recuperar | Efecto físico real | Riesgo |
|---|---|---:|---|---|
| 1 | Retirar el índice duplicado `products_updated_at_idx` | 1,40 | Inmediato: `DROP INDEX` borra el archivo | Muy bajo |
| 2 | Retirar `price_history_product_store_idx` si su uso sigue en cero | 33,03 | Inmediato | Bajo, condicionado a la lectura previa |
| 3 | Ola 2 de índices de bajo uso (cinco candidatos) | hasta 57,18 | Inmediato | Medio, cada uno exige evidencia propia |
| 4 | Guardas de escritura: resúmenes y `last_scraped_at` | 0 ahora | Menos versiones muertas e inserciones en índices por observación; frena el bloat futuro | Bajo, probado contra las definiciones originales |
| 5 | Barrido diario de caché vencida que no es telemetría | desconocido, ~2.168 filas al corte | Espacio reutilizable, no achica el archivo | Muy bajo |
| 6 | Telemetría agregada por request | 0 ahora | Menos filas por día; el respaldo existente drena antes el atraso | Medio: cambia escritores y lectores |

Los MB de índices salen de la lectura del 07/10 ([evidencia](../retencion-2026-10-07/capacidad/evidencia.json)). Si se aplicaran las olas 1, 1b y 2 completas (91,6 MB), la base quedaría cerca de 846 MB: sigue lejos de 500 MB.

La palanca grande sigue siendo `api_cache_entries` (245,4 MB al 07/10, 343.489 eventos de telemetría vencidos). Esas filas ya tienen retención respaldada diaria (hasta 1.000 por día). A ese ritmo el atraso tarda unos 796 días ([retención automática](../retencion-automatica-2026-10-07/README.md)). Cuando esa tabla quede casi vacía de filas vivas, un `VACUUM FULL` sobre ella será barato en espacio temporal, porque copia sólo lo vivo. Sin embargo, toma un lock exclusivo: necesita una ventana y una aprobación propias. Acelerar ese drenaje (lotes mayores respaldados) es una decisión separada; este paquete no la toma ni la duplica.

### Qué es realista en Supabase Free

- `DELETE` (barrido, retención) no reduce `pg_database_size`. VACUUM ordinario deja el espacio reutilizable para filas nuevas de **la misma tabla**. Sólo se libera al sistema operativo el bloque final vacío de la tabla.
- `VACUUM FULL` reescribe la tabla con lock `ACCESS EXCLUSIVE` y necesita espacio libre para la copia viva. Es viable en `api_cache_entries` *después* del drenaje. En `products` o `price_history` no hay margen demostrado.
- `pg_repack` figura entre las extensiones que ofrece Supabase, pero no se verificó en este proyecto: requiere cliente, espacio para la copia y su propia aprobación.
- `DROP INDEX CONCURRENTLY` libera el archivo del índice sin bloquear lecturas ni escrituras. `CREATE INDEX CONCURRENTLY` (rollback) necesita espacio del tamaño del índice.

## Verificación local (PostgreSQL 17.11, clúster propio)

Clúster nuevo en un directorio temporal privado, TCP sólo en `127.0.0.1:55432`. Se aplicaron `bootstrap-local.sql` y las 77 migraciones, igual que `verify.yml`. Al terminar, se detuvo y se borró el directorio.

- [`supabase/tests/espacio_db_drafts.sql`](../../../supabase/tests/espacio_db_drafts.sql): aplica los borradores 01–03, prueba su comportamiento y revierte. Corre el mismo escenario de diez pasos con las definiciones originales y con los borradores, y exige resúmenes iguales **después de cada paso**. Al final comprueba que las reversiones restauran exactamente las funciones y los triggers originales (por md5). Resultado: `espacio_db_drafts: OK`.
- **Sensibilidad del test:** si se quita `last_updated` del WHEN histórico, el test falla en el paso de desempate. También falla si se quita `source_identity` del WHEN comparable.
- **Regresiones del proyecto con los borradores aplicados:** las 13 suites SQL de CI, `scripts/test-current-catalog-prices.mjs` y las dos pruebas de concurrencia de dos sesiones (`catalog-concurrency.test.mjs`) aprobadas. `search_usable_offers` y `prepared_catalog_matching` también aprobaron. Otras tres suites exigen otro entorno (base vacía con un flag, `storage.objects`, permisos de fixture) y no son evidencia ni a favor ni en contra.
- **Amplificación medida en una sola transacción:** 20 observaciones `persist_verified_priority_offer`, dos tiendas × diez minutos, mismo precio. Las cifras son de laboratorio, con páginas recién creadas; no son tasas de producción.

| Tabla | UPDATE original | UPDATE con borradores |
|---|---|---|
| `catalog_price_summaries` | 80 (32 no-HOT) | 20 (20 no-HOT) |
| `products` | 20 (10 no-HOT) | 2 (1 no-HOT) |
| `product_prices` | 40 (20 HOT) | 40 (20 HOT), sin cambio |

`comparable_latest_observed_at` quedó al día en ambas corridas. `products.last_scraped_at` quedó 9 minutos atrás de la última observación con el borrador, dentro del límite de 15.

- **Plan del barrido:** con 330.000 eventos vencidos y 2.500 filas barribles sintéticas, la selección usa `api_cache_entries_scope_idx`, no recorre la telemetría, y elimina 1.000 filas en 5,7 ms.

---

## Operación 1 — Barrido de caché vencida no telemétrica

**Problema verificado.** `getSharedCache` sólo borra una entrada vencida cuando vuelve a leer **la misma clave** ([`shared-cache.ts`](../../../src/lib/server/shared-cache.ts) líneas 150–173). Las claves versionadas (`catalog-v14|q=…|page=…` en `search-response-v2`, IDs en `product-detail-v3`) cambian con cada versión o combinación de filtros, así que las viejas no se revisitan. La telemetría escribe una fila por evento, con clave `scope:finishedAtMs:startedAtMs:…` ([`utils.ts`](../../../src/lib/metrics/utils.ts) línea 115, [`storage.ts`](../../../src/lib/metrics/storage.ts) líneas 16–31). Esa telemetría ya está cubierta por la retención respaldada y queda fuera de este barrido.

**Borrador:** [`01-sweep-expired-shared-cache.sql`](sql/01-sweep-expired-shared-cache.sql). Instala `sweep_expired_shared_cache(p_cutoff, p_limit)`:

- **Lista de permitidos:** `search-response(-v2)`, `product-detail(-v3)`, `home-sections`, `popular-products`, `price-index`, `jev-identity(-offer)` y `store-scrape-circuit`. Todos se leen sólo con `getSharedCache`, que trata una entrada vencida como ausente.
- **Excluidos con motivo:**
  - Los dos scopes `operational-*`: tienen la retención respaldada existente y no se duplica.
  - `catalog-refresh-demand`: [`refresh-demand.ts`](../../../src/lib/catalog/refresh-demand.ts) líneas 61–83 lee el contador **sin** mirar `expires_at`, así que borrarlo reinicia la acumulación de demanda.
  - `eneba-affiliate-pilot`: una sola fila, con contrato del productor.
  - Cualquier scope desconocido.
- **Límites:** corte al menos 5 minutos en el pasado, `expires_at < corte` y `updated_at <= corte`, límite 1–2.000 y `FOR UPDATE SKIP LOCKED`. El `DELETE` reevalúa el predicado, así que una renovación concurrente se conserva. Además, `lock_timeout` 500 ms y `statement_timeout` 15 s.
- **Permisos:** `SECURITY INVOKER` con `EXECUTE` sólo para `service_role`. Es el patrón vigente más cercano (`select_backed_telemetry_candidates` y `retire_backed_telemetry`, migración `20261007215027`). Un `SECURITY DEFINER` daría privilegios de dueño sin necesidad, porque service_role ya tiene políticas sobre la tabla.

**Estimación (corte del 07/10, [medicion.json](../capacidad-2026-10-07/medicion.json)).** El barrido alcanzaría unas 2.168 filas: `search-response` 1.914, `jev-identity-offer` 133, `product-detail` 74, `jev-identity` 41, `home-sections` 3, `search-response-v2` 2 y `store-scrape-circuit` 1. No hay medida de bytes por scope. La lectura B del preflight los mide; no se extrapola desde el promedio de la tabla, dominado por telemetría. El valor principal es **preventivo**: cada versión nueva de clave de búsqueda deja huérfanas todas las anteriores.

**Gancho en la programación existente (no editado).** En `.github/workflows/catalog-refresh.yml`, el job `telemetry-maintenance` ya corre sólo en el primer intento del diario natural `5 5 * * *` con modo `priority`. Se propone agregar al final de ese job:

```yaml
      - name: Sweep expired shared cache
        if: ${{ always() && vars.SHARED_CACHE_SWEEP_MODE == 'sweep' }}
        run: node scripts/shared-cache-sweep.mjs --limit 1000 --max-calls 5 --deadline-ms 60000 --out "$RUNNER_TEMP/shared-cache-sweep.json"
```

El script (a escribir, fuera de este encargo) seguiría el estilo de `telemetry-maintenance-network.mjs`:

- Sólo hace `POST /rest/v1/rpc/sweep_expired_shared_cache`, sin redirects.
- Hace como máximo `--max-calls` llamadas y se detiene cuando `may_have_more` es falso.
- Usa un corte fijo de ahora − 5 min y guarda el recibo agregado como artefacto de 30 días.

Si la variable no existe, el paso no corre. No suma un scheduler nuevo.

- **Prerrequisitos:**
  - Lecturas A, B y E del [preflight](sql/00-preflight-readonly.sql).
  - E debe mostrar que la función no existe y que service_role puede SELECT, UPDATE y DELETE.
- **Verificación posterior:**
  - Repetir B.
  - Las vencidas de los scopes permitidos bajan.
  - Telemetría, `catalog-refresh-demand`, Eneba y las filas activas no cambian.
  - Comprobar que la búsqueda pública responde.
- **Reversión:** [`01-…rollback.sql`](sql/01-sweep-expired-shared-cache.rollback.sql) quita la función. No restaura filas, que ya se trataban como ausentes. Para frenar sólo la ejecución, alcanza con quitar la variable.
- **Aprobaciones textuales necesarias (dos):**
  1. «Autorizo instalar en Supabase producción únicamente la función de `docs/reports/espacio-db-2026-10-08/sql/01-sweep-expired-shared-cache.sql` del commit `<hash>`, sin ejecutarla.»
  2. «Autorizo ejecutar `sweep_expired_shared_cache` con corte `<ISO UTC>` y límite 1.000, hasta 5 llamadas, y después medir.» Si se quiere automático: «Autorizo crear la variable `SHARED_CACHE_SWEEP_MODE=sweep` y publicar el paso y el script revisados.»

## Operación 2 — Telemetría agregada por request (propuesta, sin SQL)

**Hoy.** `runObservedStoreScrape` llama a `recordStoreScrapeEvent` y luego a `persistTelemetryEntry`: es un upsert por tienda y por request ([`recorder.ts`](../../../src/lib/metrics/recorder.ts) líneas 25–49). Los endpoints también escriben un evento cada uno (líneas 51–74). En el corte del 07/10 se crearon 664 eventos de tienda en 24 h y 3.937 en 7 días; la media conservada fue de 568 por día.

**Lectores que dependen de una fila por evento:**

- `readPersistedTelemetryState` en [`storage.ts`](../../../src/lib/metrics/storage.ts) líneas 44–80, que [`metrics/api.ts`](../../../src/lib/metrics/api.ts) usa para el snapshot operativo de admin. Lee `payload`, filtra `expires_at > now`, ordena por `updated_at` y limita a 1.500/1.000 **filas**.
- `readOperations` en [`measurement/providers.ts`](../../../src/lib/measurement/providers.ts) líneas 168–181, con el mismo patrón, para el tablero de medición.
- `mergeState` deduplica con `buildEventKey`.
- La retención y el respaldo fijan los scopes por nombre en SQL (`20261007215027` líneas 30, 69 y 92) y en `scripts/lib/telemetry-maintenance.mjs`, `telemetry-retention.mjs`, `telemetry-backup.mjs`, `telemetry-backed-retention.mjs`, además de la guarda de red.

**Diseño compatible.**

- **Escritura:** un scope nuevo, `operational-request-batch`, con una fila por request. El payload sería `{version: 1, endpoint, endpointEvent, storeEvents: [...]}`, recolectado durante el handler (AsyncLocalStorage funciona con `nodejs_compat` en Workers) y persistido una vez al final. Los eventos conservan sus campos, así que `buildEventKey` y `mergeState` no cambian.
- **Lectura:**
  - Leer el scope nuevo y los dos viejos durante 48 h (TTL actual).
  - Aplanar a eventos y aplicar los topes 1.500/1.000 **por evento**, no por fila.
  - Pasado el TTL, dejar de leer los viejos; sus filas siguen en la retención respaldada.
- **Retención:** el scope nuevo debe entrar a la retención **respaldada**, no al barrido de la operación 1, porque es telemetría bajo el criterio ya aprobado. Hay que revisar los topes, porque las filas serán más grandes: 4 MiB por snapshot, 250 filas por lote y 5 MiB por run.
- **Beneficio:** el factor de reducción es la cantidad de tiendas por request, que no está medida; la lectura B y un conteo por minuto de `finishedAtMs` lo estiman. Con el promedio de la tabla (unos 706 B por fila, todos los scopes) se evitarían menos de 0,4 MB por día. El efecto útil es otro: si el ingreso bajara de ~568 a unas decenas por día, el mismo tope de 1.000 por día drenaría el atraso en aproximadamente 350 días en lugar de 796. Es una hipótesis aritmética, no una fecha.
- **Riesgo:** medio. Toca escritores calientes, dos tableros y cinco scripts de retención. Si una request se cae a mitad de camino, pierde todos sus eventos de tienda, cuando antes perdía sólo los no escritos. Requiere su propia candidata con tests de lectores.

## Operación 3 — Amplificación de escritura por observación

### Afirmaciones verificadas y corregidas

1. **`UPDATE product_prices` no es HOT. Confirmado.** `product_prices_last_updated_idx btree(last_updated DESC)` (`20260304235643` línea 84) cambia en cada observación. El índice parcial `sitemap_eligible` usa `price` y `stock` en su predicado. Además, **todos los wrappers hacen dos UPDATE por observación**:
   - `persist_catalog_offers` (`20261002003210` líneas 84–88).
   - `persist_verified_priority_offer` y `persist_verified_requested_offer` (`20261002151329` líneas 23–24 y 36–37).
   - El segundo UPDATE sólo toca `source_identity`, `identity_review` y `price_condition`.
2. **Dos triggers sin WHEN reescriben el JSONB de `catalog_price_summaries`. Confirmado:** `product_prices_catalog_summary` (`20260930133000` línea 79) y `product_prices_usable_summary` (`20261002150827` línea 60). Combinado con el punto 1, son **cuatro** reescrituras del resumen por observación; el histórico se reescribe aunque su contenido no cambie.
3. **`products.last_scraped_at` y `products_set_updated_at`. Corregido.**
   - El trigger no es la causa: `set_catalog_updated_at` (`20260307002840`) conserva `updated_at` cuando `content_signature` no cambia, así que no hace falta excluir `last_scraped_at` de ese trigger.
   - La causa es que `last_scraped_at` integra tres índices: `products_catalog_lookup_idx` (INCLUDE), `products_catalog_identity_preference_idx` y `products_refresh_priority_last_scraped_idx`.
   - Cada avance impide HOT e inserta en **los 20 índices** de `products`, 7 de ellos GIN trigram: name, brand, model, family_key, variant_key, normalized_title y catalog_document.
   - Lo escriben `persist_adaptive_offer` (`20261002143236` línea 49), `persist_priority_offer_unlocked` (`20260929161015` línea 29) y `persist_requested_offer_unlocked` (`20260927234548` línea 30).
   - El upsert TypeScript (`product-catalog.ts` línea 291) ya se limita a 12 h mediante `product-write-dedupe.ts`.

### Contratos de frescura

- **Frescura de la oferta.** Es `product_prices.last_updated`. Llega a `comparable_offers[].last_updated`, `comparable_latest_observed_at`, `comparable_valid_until` y `comparable_stats.observed_at`, y la ventana de 24 h se evalúa al leer (`catalog_current_price_stats`). Por eso `last_updated` está en **los dos** WHEN: una observación que sólo renueva la fecha sigue reescribiendo el resumen comparable. Es inherente al contrato actual mientras la frescura viva dentro del resumen.
- **Resumen histórico.** No guarda fechas, pero usa `last_updated` como desempate entre dos URLs de la misma tienda con el mismo precio. Por eso también está en su WHEN; el test lo demuestra.
- **`products.last_scraped_at` no es evidencia de oferta.** Lo leen:
  - El puntaje de búsqueda, con cubetas de 4/24/72 h y 7 días (`search-ranking.ts` línea 206 y SQL `20260930133000` líneas 138–141).
  - El desempate de identidad.
  - `planning.ts` líneas 211–214 (refresh hot/tracked).
  - La poda de ofertas fantasma (`stale-product-prices.ts`).

  Con el borrador, el valor puede **atrasarse** menos de 15 minutos, nunca adelantarse. El planificador lo ve vencido antes y la poda lo ve menos fresco, así que borra menos.

### Borradores

[`02-summary-trigger-guards.sql`](sql/02-summary-trigger-guards.sql):

- Separa cada trigger en INSERT/DELETE incondicional y UPDATE con WHEN, conservando el orden alfabético (histórico antes que comparable).
- WHEN histórico: `product_id, store_id, price, stock, url, identity_review, last_updated`.
- WHEN comparable: los mismos más `source_identity`.
- El resumen histórico no escribe si el resultado es idéntico. Se corrigió una trampa: la versión original decidía el `DELETE` con `FOUND` del upsert, y con `DO UPDATE … WHERE` una fila idéntica dejaría `FOUND` en falso y **borraría** el resumen. Ahora se decide antes con `catalog_price_stats`.
- El comparable no escribe si sus cinco columnas no cambian, y toma el lock de la ficha por sí mismo, porque antes lo heredaba del trigger histórico. El orden de bloqueo es el mismo que ya existía.

[`03-products-last-scraped-throttle.sql`](sql/03-products-last-scraped-throttle.sql):

- Trigger BEFORE UPDATE que devuelve NULL (omite la fila) cuando lo único distinto es `last_scraped_at` y avanza menos de 15 minutos.
- Compara la fila completa en JSONB menos `last_scraped_at` y las cuatro columnas GENERATED. Así, una columna base nueva en el futuro **impide** la omisión (falla cerrado).
- Ningún escritor SQL consulta `FOUND` después de ese UPDATE.

**Alternativa descartada:** `suppress_redundant_updates_trigger()` sobre `product_prices` anularía el segundo UPDATE idéntico. Pero `persist_verified_*` devuelve `found` de ese UPDATE: devolvería `false` con la observación ya guardada.

**Fuera de alcance, sugerido para después:**

- Volver condicional el segundo UPDATE de los wrappers.
- Estudiar `product_prices_last_updated_idx` (13,2 MB, 29.446 lecturas al 07/10; lector visible: `seo/store-catalog.ts` línea 24). Retirarlo haría HOT la mayoría de las observaciones sin cambio de precio, si hay espacio en página.

### Operación de las guardas

- **MB recuperados:** 0 de inmediato. Bajan las versiones muertas y las entradas de índice nuevas por observación (en laboratorio: resúmenes 80→20, ficha 20→2). Eso reduce el crecimiento de bloat en los índices de `products` (162,7 MB al 07/10) y de los resúmenes, y hace más duradero cualquier `REINDEX` futuro.
- **Prerrequisitos:**
  - Lectura E: triggers y md5 iguales a las migraciones de origen. Si difieren, **no aplicar**: producción tiene otra versión.
  - Lectura D como línea base.
- **Riesgo:** bajo. `DROP TRIGGER` toma un lock `ACCESS EXCLUSIVE` breve sobre `product_prices`, y `CREATE TRIGGER` sobre `products` toma `SHARE ROW EXCLUSIVE`. Mientras espera, el lock exclusivo también hace esperar a las lecturas. Por eso `lock_timeout` 5 s hace fallar el DDL en vez de dejarlo en cola: si falla, reintentar fuera del diario `priority`. Los resúmenes ya escritos no cambian.
- **Verificación posterior:**
  - Repetir E y D a las 24 h: menos `n_tup_upd` en `catalog_price_summaries` y `products` en relación con `product_prices`.
  - Comprobar `comparable_latest_observed_at` de una ficha observada recientemente.
  - Revisar en el sitio la búsqueda y una ficha con dos tiendas.
- **Reversión:** [`02-…rollback.sql`](sql/02-summary-trigger-guards.rollback.sql) y [`03-…rollback.sql`](sql/03-products-last-scraped-throttle.rollback.sql) restauran las definiciones exactas (md5 verificado localmente). No necesitan backfill.
- **Aprobación textual:** «Autorizo aplicar en Supabase producción únicamente `02-summary-trigger-guards.sql` y `03-products-last-scraped-throttle.sql` del commit `<hash>`, después de que el preflight E coincida con las migraciones, y medir D a las 24 h.» Pueden aprobarse por separado.

## Operación 4 — Índices redundantes o sin uso

**Definiciones verificadas en migraciones.** No existe ningún `DROP INDEX` posterior sobre estas tablas. El inventario coincide con los 39 índices leídos el 07/10.

| Índice | Definición | Origen | MB / lecturas al 07/10 | Decisión |
|---|---|---|---|---|
| `products_updated_at_idx` | `btree(updated_at DESC)` | `20260304235643`:81 | 1,40 / 3.065 | **Retirar**: idéntico a `products_updated_at_desc_idx` (`20260501172403`:8, 71.522 lecturas), que se conserva |
| `price_history_product_store_idx` | `(product_id, store_id, recorded_at DESC)` | `20260501172403`:21 | 33,03 / 0 | **Retirar si sigue en cero** |
| `price_history_product_recorded_idx` | `(product_id, recorded_at DESC)` | `20260304235643`:85 | 30,10 / 3.446 | Ola 2 |
| `price_history_store_recorded_idx` | `(store_id, recorded_at DESC)` | `20260304235643`:86 | 9,63 / 623 | Ola 2; sostiene el FK a `stores` (RESTRICT/CASCADE) |
| `price_history_offer_idx` | `(product_id, store_id, offer_url, recorded_at DESC)` | `20260824174500`:59 | 44,73 / 9,4 M | **Conservar**: `hardware_price_index` lo usa (join por producto, tienda y URL; `20260902040126`:50) y cubre los FK por `product_id` |
| `price_history_recorded_at_idx` | `(recorded_at DESC)` | `20260501172403`:18 | 5,88 / 27.651 | **Conservar**: «Bajaron de precio» (`home-sections.ts`:301) |
| `product_prices_product_id_idx` | `(product_id)` | `20260304235643`:82 | 6,97 / 140,3 M | **No retirar** sin EXPLAIN comparado: es prefijo del unique `(product_id, store_id, url)`, ~3,4 veces mayor, en la lectura más caliente |
| `catalog_price_summaries_lowest_idx` | `(lowest, product_id)` | `20260930133000`:45 | 9,26 / 1 | Ola 2; además se escribe en cada actualización no-HOT del resumen |
| `product_prices_sitemap_eligible_idx` | parcial `(product_id, store_id)` | `20260912170000`:5 | 6,20 / 0 | Ola 2; revisar el plan de la RPC de sitemap |
| `products_family_key_idx` | `(family_key)` | `20260305210426`:18 | 1,99 / 0 | Ola 2 |

`price_history` tiene seis índices: la PK más cinco. Los dos que usa el índice de hardware y «Bajaron de precio» se conservan siempre.

**Borradores:** [`04-drop-redundant-indexes.sql`](sql/04-drop-redundant-indexes.sql) trae la ola 1 activa, la 1b y la 2 comentadas, todas con una sentencia `CONCURRENTLY` por vez. La reversión, [`04-…rollback.sql`](sql/04-drop-redundant-indexes.rollback.sql), trae el `CREATE INDEX CONCURRENTLY` exacto de cada origen.

**Lectura previa obligatoria:** la consulta C del [preflight](sql/00-preflight-readonly.sql) (`pg_get_indexdef`, `pg_relation_size`, `idx_scan`, `last_idx_scan`, validez y constraints). El 07/10 `stats_reset` era NULL: un contador sin período no prueba desuso. Por eso los criterios usan **deltas**.

**Criterios de decisión:**

- **Ola 1:**
  - Las definiciones de ambos índices `updated_at` son idénticas en C.
  - `products_updated_at_desc_idx` es válido.
  - Ninguno sostiene constraints.
- **Ola 1b:**
  - `idx_scan` de `price_history_product_store_idx` es igual en dos lecturas C separadas al menos 7 días, y una de ellas abarca un diario `priority` completo.
  - `last_idx_scan` es NULL o anterior a la primera lectura.
  - `price_history_offer_idx` es válido.
- **Ola 2:** el mismo criterio de delta cero en 7 días por índice, más una búsqueda en `src/` y en las RPC vigentes que no encuentre un lector cuyo plan dependa de él. Para `store_recorded`, aceptar que borrar o renombrar una tienda recorrerá `price_history` completo.
- **Cualquier índice con delta mayor que cero queda fuera.**

- **Riesgo:** bajo para la ola 1. Bajo o medio para el resto: una consulta poco frecuente podría pasar a un recorrido completo.
- **Verificación posterior:**
  - Lectura A: `pg_database_size` baja en aproximadamente el tamaño retirado.
  - Comprobar el índice de hardware (RPC `hardware_price_index(90)`), «Bajaron de precio» en la home y la búsqueda.
- **Reversión:** el `CREATE INDEX CONCURRENTLY` correspondiente, con espacio libre igual al tamaño original.
- **Aprobaciones textuales:**
  - Ola 1: «Autorizo ejecutar en producción únicamente `DROP INDEX CONCURRENTLY public.products_updated_at_idx;` después de la lectura C.»
  - Ola 1b: «Autorizo ejecutar únicamente `DROP INDEX CONCURRENTLY public.price_history_product_store_idx;`; las lecturas C del `<fecha 1>` y del `<fecha 2>` muestran el mismo `idx_scan`.»
  - Ola 2: una aprobación por índice, nombrándolo.

## Lo que no se hizo

- No hubo conexión a Supabase: ni MCP, ni psql remoto, ni comandos remotos del CLI. Tampoco `DELETE`, índices, `VACUUM`, cambios de workflow, variables, publicación ni push.
- No se escribió el script del gancho del barrido ni el código de la telemetría agregada: tocan `scripts/` y `src/`, fuera de este encargo.
- `espacio_db_drafts.sql` no está agregado a `verify.yml`, para no cambiar CI con borradores no aprobados.
- Los bytes por scope de la caché, el factor tiendas por request y el bloat real de los índices remotos siguen sin medir. Se obtienen con las lecturas B, C y D del preflight, bajo autorización de lectura.
