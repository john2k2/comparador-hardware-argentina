# Índices: inventario y candidatos locales

Estado: diagnóstico de lectura; no se aplicó DDL, mantenimiento, cambios de datos ni refresh. Proyecto `zyiyziubpcpgoqlkcrie`; PostgreSQL 17.6. Copia local revisada: `22ccfbed145f1caba8008b82fdc14e5b157be45d` más trabajo compartido.

Hay **un duplicado estructural exacto**: `products_updated_at_idx` y `products_updated_at_desc_idx`. Cada uno ocupa **1.409.024 B**; conservar uno permite proponer la retirada del otro. Los otros pares examinados difieren por cobertura, prefijos, predicados, operadores, orden o restricciones.

Fuentes remotas: SELECT de `pg_class`, `pg_index`, `pg_indexes`, `pg_constraint`, `pg_depend`, `pg_proc`, `pg_stat_user_indexes`, `pg_stat_database` y tamaños. Cortes UTC: cuatro tablas **2026-10-08 20:52:29.739525**; confirmación del duplicado **20:53:28.739026**; nombres **20:54:33.910079**; resúmenes **20:56:10.213901**; líneas de lectores SQL **20:56:12.132668**.

`stats_reset` de la base retornó **NULL**: no se puede establecer el período cubierto por los contadores. `idx_scan=0` no prueba inutilidad. Son cortes separados durante actividad de producción, no un cierre simultáneo ni medición del resultado del drenaje.

| Tabla | Tabla incl. TOAST/FSM/VM (B) | Índices (B) | Total (B) | Filas estimadas |
|---|---:|---:|---:|---:|
| api_cache_entries | 167501824 | 78077952 | 245579776 | 311524 |
| price_history | 43892736 | 134553600 | 178446336 | 249691 |
| product_prices | 40435712 | 63045632 | 103481344 | 73705 |
| products | 73646080 | 164798464 | 238444544 | 59571 |
| catalog_price_summaries | 68362240 | 51036160 | 119398400 | no consultadas |

`pg_indexes_size` suma **491.511.808 B** entre ambos cortes; los forks principales de los **42 índices** enumerados suman **491.044.864 B**. Las funciones miden cosas distintas: [pg_relation_size sin fork mide main; pg_indexes_size suma el espacio de los índices](https://www.postgresql.org/docs/17/functions-admin.html). El tamaño de la base fue **939.486.355 B** en el primer corte; no equivale al uso facturado ni demuestra recuperación de la cuota de 500 MB. Son asignaciones existentes, no ahorro medido tras una intervención.

`catalog_product_matches` no existe como relación ni como función exacta. El matching está en `catalog_matches_query` y dos sobrecargas de `catalog_matches_prepared`; la tabla de lectura pertinente es `catalog_price_summaries`.

Inventario completo: firmas de `pg_get_indexdef`; todos los índices resultaron válidos y listos. Bytes = fork principal (`pg_relation_size`); U/PK = unique/primary key. Las firmas conservan método, predicados, INCLUDE, expresiones y orden. Las asignaciones candidatas siguientes usan también main.

| Tabla / índice | B | Firma | idx_scan |
|---|---:|---|---:|
| api_cache_entries_expires_idx | 9576448 | `btree (expires_at)` | 43728 |
| api_cache_entries_pkey | 64364544 | `PK btree (cache_key)` | 418587 |
| api_cache_entries_scope_idx | 4112384 | `btree (scope)` | 38 |
| price_history_offer_idx | 45219840 | `btree (product_id, store_id, offer_url, recorded_at DESC)` | 9404500 |
| price_history_pkey | 9863168 | `PK btree (id)` | 760 |
| price_history_product_recorded_idx | 30343168 | `btree (product_id, recorded_at DESC)` | 3446 |
| price_history_product_store_idx | 33325056 | `btree (product_id, store_id, recorded_at DESC)` | 853 |
| price_history_recorded_at_idx | 5955584 | `btree (recorded_at DESC)` | 27679 |
| price_history_store_recorded_idx | 9773056 | `btree (store_id, recorded_at DESC)` | 623 |
| product_prices_inventory_reference_idx | 8134656 | `btree (store_id, regexp_replace(regexp_replace(url, '^https://www[.]'::text, 'https://'::text), '/$'::text, ''::text))` | 149609 |
| product_prices_last_updated_idx | 13336576 | `btree (last_updated DESC)` | 30341 |
| product_prices_pkey | 3244032 | `PK btree (id)` | 552330 |
| product_prices_product_id_idx | 6971392 | `btree (product_id)` | 140526447 |
| product_prices_product_id_store_id_url_key | 23576576 | `U btree (product_id, store_id, url)` | 885869 |
| product_prices_sitemap_eligible_idx | 6242304 | `btree (product_id, store_id) WHERE ((price > (0)::numeric) AND (url IS NOT NULL) AND (stock <> 'out-of-stock'::text))` | 0 |
| product_prices_store_id_idx | 1417216 | `btree (store_id)` | 33509 |
| products_brand_trgm_idx | 2449408 | `gin (brand gin_trgm_ops)` | 3313 |
| products_canonical_product_key_idx | 6463488 | `btree (canonical_product_key)` | 137751 |
| products_catalog_document_trgm_idx | 21307392 | `gin (catalog_document gin_trgm_ops)` | 571 |
| products_catalog_identity_preference_idx | 14761984 | `btree (category, catalog_identity, ((id ~~ 'agrupado-%'::text)) DESC, last_scraped_at DESC NULLS LAST, updated_at DESC, id) WHERE catalog_component` | 514721 |
| products_catalog_lookup_idx | 17367040 | `btree (id) INCLUDE (category, catalog_identity, last_scraped_at, updated_at) WHERE catalog_component` | 3583623 |
| products_category_idx | 704512 | `btree (category)` | 35194 |
| products_category_lowest_price_idx | 3989504 | `btree (category, lowest_price)` | 6661 |
| products_category_updated_at_idx | 1990656 | `btree (category, updated_at DESC)` | 1488 |
| products_family_key_idx | 1990656 | `btree (family_key)` | 0 |
| products_family_key_trgm_idx | 9076736 | `gin (family_key gin_trgm_ops)` | 3272 |
| products_grouped_lowest_price_idx | 9175040 | `btree (id text_pattern_ops, lowest_price) WHERE (lowest_price > (0)::numeric)` | 1995 |
| products_model_trgm_idx | 17178624 | `gin (model gin_trgm_ops)` | 3313 |
| products_name_trgm_idx | 17211392 | `gin (name gin_trgm_ops)` | 3336 |
| products_normalized_title_category_idx | 4005888 | `btree (normalized_title varchar_pattern_ops, category)` | 60 |
| products_normalized_title_trgm_idx | 12353536 | `gin (normalized_title gin_trgm_ops)` | 3312 |
| products_pkey | 5316608 | `PK btree (id)` | 6378027 |
| products_refresh_priority_last_scraped_idx | 3538944 | `btree (refresh_priority, last_scraped_at DESC)` | 546 |
| products_updated_at_desc_idx | 1409024 | `btree (updated_at DESC)` | 71532 |
| products_updated_at_idx | 1409024 | `btree (updated_at DESC)` | 3065 |
| products_variant_key_trgm_idx | 12926976 | `gin (variant_key gin_trgm_ops)` | 3271 |
| catalog_price_summaries_current_bounds_idx | 2605056 | `btree (comparable_latest_observed_at DESC, (((comparable_stats ->> 'lowest'::text))::numeric), product_id) INCLUDE (comparable_valid_until) WHERE ((comparable_stats IS NOT NULL) AND (comparable_latest_observed_at IS NOT NULL))` | 708 |
| catalog_price_summaries_lookup_idx | 23715840 | `btree (product_id) INCLUDE (lowest, highest, average, available, offer_ids)` | 1142591 |
| catalog_price_summaries_lowest_idx | 9256960 | `btree (lowest, product_id)` | 1 |
| catalog_price_summaries_observed_idx | 4554752 | `btree (comparable_latest_observed_at DESC, product_id) WHERE (comparable_latest_observed_at IS NOT NULL)` | 866 |
| catalog_price_summaries_pkey | 8953856 | `PK btree (product_id)` | 6010181 |
| catalog_price_summaries_stores_idx | 1875968 | `gin (store_ids)` | 401 |

El duplicado exacto tiene la misma tabla, B-tree, clave `updated_at`, opclass 3127, collation 0, opción 3 (`DESC NULLS FIRST`), sin expresión, predicado ni INCLUDE; ambos no únicos, reloptions NULL y sin dependencia de constraint. La recomendación local es conservar `products_updated_at_desc_idx` y preparar una migración aparte que retire `products_updated_at_idx`. Origen: `20260304235643_initial_argen_prices_schema.sql:81` y `20260501172403_add_home_page_performance_indexes.sql:8`.

| Candidato a laboratorio | Alternativa existente | Asignación candidata (B) | Condición |
|---|---|---:|---|
| product_prices_product_id_idx | UNIQUE(product_id, store_id, url) | 6971392 | Prefijo izquierdo compatible; comparar selectividad, buffers, latencia y controles FK con índice más ancho. |
| product_prices_store_id_idx | (store_id, URL normalizada) | 1417216 | Prefijo compatible; medir lecturas por tienda y comprobaciones FK, sin cambiar normalización. |
| products_category_idx | (category, lowest_price) o (category, updated_at DESC) | 704512 | Prefijo compatible; medir filtros de categoría y FK, incluyendo valores NULL. |

Estos tres prefijos más el duplicado suman **10.502.144 B** de asignación candidata, no ahorro validado. `product_prices_product_id_idx` registra 140.526.447 scans: eliminarlo sin reproducir su carga sería una apuesta. Ninguno de los tres sostiene directamente una restricción; eso no elimina su utilidad para revisar FK o consultas comunes.

`catalog_price_summaries_lookup_idx` ocupa **23.715.840 B** y comparte `product_id` con la PK, pero su INCLUDE conserva `lowest/highest/average/available/offer_ids`. No es duplicado: puede evitar accesos al heap. Es un candidato separado a medir localmente por su costo de cobertura; aún no hay evidencia para retirarlo ni se incluye en los 10.502.144 B.

No eliminar por semejanza: los índices de historia `(product, recorded)`, `(product, store, recorded)` y `(product, store, URL, recorded)` ordenan poblaciones distintas cuando las claves intermedias no están fijadas. El índice global `recorded_at` sirve al corte temporal sin producto. `store, recorded` cubre otro prefijo.

En resúmenes, `observed_idx` acepta filas con `comparable_stats IS NULL`; `current_bounds_idx` las excluye y agrega el mínimo comparable entre fecha y producto. La RPC usa una rama de estadísticas vigentes y otra de estadísticas faltantes/vencidas. El `lowest` histórico no equivale a `(comparable_stats->>'lowest')::numeric`. No sustituir ninguno sólo por pocos scans.

Las PK/UNIQUE conservan identidad, ON CONFLICT e integridad referencial; en todas las claves únicas consultadas `indnullsnotdistinct=false` (NULLS DISTINCT). `products_pkey` es padre de precios, historia, resúmenes, inventario, interés de refresh, favoritos y alertas; `product_prices_pkey` es padre del estado de refresh. Los FK a stores/categories conservan sus PK padres. Los checks de precio/stock no justifican retirar un índice.

`products_catalog_lookup_idx` es parcial y cubriente; la PK no reproduce su INCLUDE/predicado. `*_pattern_ops`, opclasses/collations normales y GIN trigrama no son equivalentes. Los seis GIN de campos siguen la búsqueda OR lexical; `catalog_document` cubre otra expresión. `sitemap_eligible_idx` tiene un predicado de elegibilidad explícito, aunque marque cero scans.

Fuentes locales y contratos contrastados con líneas de funciones vigentes obtenidas mediante `pg_proc` (no se invocaron las RPC):

- `src/lib/persistence/product-read.ts:50,90,121,173` y `product-read-helpers.ts:79`: clave canónica, orden por actualización, búsqueda RPC y fallback lexical OR; `product-catalog.ts:385`: upsert por id.
- `20261006024548_current_catalog_bounded_candidates_function.sql:29,36,39,87,114,116`: dos ramas de resúmenes, selección de identidad y matching. Live `search_catalog_page` md5 `b13d0d9501a86ffe618a7de2bc71c95d`; `catalog_matches_query` `229e9f795ede51f90352fa7ea9f53afa`.
- `20260930212914_prepared_catalog_matching.sql:12,48` y `20260930213519_catalog_offer_format_hint.sql`: matching lexical/portable. Live prepared de 8 argumentos `46730f02ed70d358be85e99dc513733b`; de 9 `c141a6eead45f74ddd35e2b79f696a74`.
- `20260930133000_catalog_price_read_model.sql:35,45,48,60,70`; `20260930142000_catalog_covering_indexes.sql:5,7`; `20261006013845_current_catalog_price_read_indexes.sql:6,9`; `20261006023536_current_catalog_bounded_candidates.sql:6`: PK/resúmenes, triggers, cobertura, predicados y preferencia de identidad.
- `20261002150827_select_current_catalog_prices.sql:26`: resumen comparable por producto desde precios. Live `sync_catalog_comparable_summary` md5 `b4ae1a8961612b4e0ce4f2f0141b411a`.
- `20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql:38,50,55,75`: historia por oferta y día Buenos Aires, desempate temporal y carry-forward; preservar consultas de horizontes 7/90/365 días. Live `hardware_price_index` md5 `690e0fd5f366627d274ab78416463312`.
- `20260824174500_catalog_integrity_and_offer_history.sql:59,62,92`: historia por URL y retención 14 días raw / 90 hourly / 365 daily. Live `cleanup_price_history` md5 `b5b6dd3198905821f135af081892e775`. `src/lib/home/home-sections.ts:296`: corte global de historia. No se retiró historia.
- `20260912170000_indexable_sitemap_rpc.sql:5,19,55`: elegibilidad y paginado. Live count md5 `e9941f2406ad8aa091a3b3bfa41705f2`, read md5 `1fade7d2d92730119092664b59336571`.
- `20261002004619_inventory_detail_fallback.sql:17,28`: lookup store + URL normalizada; `src/lib/metrics/storage.ts:31,44`: upsert cache por PK y lectura scope/expiry. Las rutas SQL anteriores están bajo `supabase/migrations/`.

Orden recomendado: (1) preparar sólo la retirada del duplicado exacto como propuesta local; (2) medir los tres prefijos con consultas representativas en laboratorio; (3) evaluar cobertura de resúmenes si persiste presión de capacidad. No combinar esas hipótesis en un DROP general.

Gates antes de cualquier propuesta remota: comprobar definición/dependencias de nuevo; comparar planes y tiempos/buffers en una copia local representativa; conservar resultados/orden/paginado/NULL/stock/frescura/identidad; probar lecturas por FK y ON CONFLICT; incluir fallback lexical, sitemap, resumen actual/vencido, índice de precios por día BA y retención vigente; preparar reversión del índice y obtener decisión expresa del coordinador. Sin ejecutar EXPLAIN ANALYZE en producción ni mantenimiento en este encargo.

Reglas de equivalencia: [prefijos B-tree](https://www.postgresql.org/docs/17/indexes-multicolumn.html), [orden/NULL](https://www.postgresql.org/docs/17/indexes-ordering.html), [operator classes](https://www.postgresql.org/docs/17/indexes-opclass.html), [predicados parciales](https://www.postgresql.org/docs/17/indexes-partial.html) e [INCLUDE/index-only](https://www.postgresql.org/docs/17/indexes-index-only-scans.html). Compartir columnas no demuestra intercambiabilidad.

Verificación: inventario estructural y dependencias mediante SELECT; revisión de lectores SQL/código; control de formato y límite de 120 líneas. No se ejecutaron tests de código ni un laboratorio de retirada, y no hay prueba de ahorro físico posterior. Único archivo escrito: este informe.
