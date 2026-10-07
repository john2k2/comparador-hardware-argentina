# Capacidad con costo cero: decisión acotada

Estado: análisis cerrado; **no hay camino probado bajo500MB dentro de los tres candidatos**. Jonathan decidió mantener costo cero y aceptar límites de alcance; no autorizó borrados ni cambiar denominadores. Esta entrega sólo escribe en tmp/capacidad-costo-cero-2026-10-07. No se usó Git ni se modificaron código, cuenta, plan, datos o configuración.

Fuente del inventario de39 índices: `docs/reports/retencion-2026-10-07/capacidad/evidencia.json`, corte15:18:55UTC. Se contrastaron usos del código/migraciones de la worktree. Sólo hubo una lectura nueva, barata, de metadatos de dos índices: BEGIN READ ONLY, statement_timeout3s, a **07/10/2026 16:05:27.160949UTC**. No consultas de filas o carga pesada.

## Los tres candidatos y su coste de alcance

| Índice candidato | Tamaño observado B | Naturaleza | Capacidad que se pierde / condición |
|---|---:|---|---|
| products_updated_at_idx, conservando products_updated_at_desc_idx |1.400.832 |Duplicado exacto confirmado por metadatos actuales |Ninguna función: ambos ofrecen updated_at DESC. Preparar una sola unidad de retiro revisable; aún no ejecutarla. |
| price_history_product_store_idx |33.030.144 |Helper de acceso producto/tienda/tiempo; no es duplicado exacto de offer_idx |No elimina resultados por definición, pero retira un camino eficiente independiente de URL. Puede empeorar peers/preflight y consultas por tienda; requiere planes y comparación local. No retirarlo por idx_scan0. |
| price_history_recorded_at_idx |5.881.856 |Acceso global al historial reciente para bajas de home |Suprimir la función opcional BAJARON DE PRECIO permitiría estudiar el retiro, con consentimiento de ese alcance. Ocultar sólo el render no evita su consulta común; preservar API y consumidores. No recomendable por capacidad. |

Los tamaños de los helpers provienen del inventario anterior. Sus constraint_count eran0; no se consultaron dependencias completas nuevas para ellos, ni se pretende que ese dato baste para retirarlos. Un índice no constraint puede seguir siendo crítico para latencia. Retirar un índice sólo puede liberar el tamaño de ese objeto si la operación autorizada se completa; no se ejecutó ni se reconstruyó nada equivalente.

## Cuánto NO alcanza

Base/caché del último corte de tamaño:929.205.395 /245.424.128B. Las tres ocupaciones suman **40.312.832B (~40,3MB)**. Retirarlas hipotéticamente dejaría **888.892.563B**.

Incluso combinando esos tres retiros con la hipótesis irrealmente favorable de recuperar cada byte de TODA la caché, quedarían **643.468.435B**: aún **143.468.435B por encima de500.000.000B**. Eliminar filas vencidas no devuelve automáticamente bytes físicos y hay caché activa. Esta comparación da un límite de lo que los candidatos pueden aportar; no constituye plan de limpieza ni promesa de shrink.

El duplicado más la función opcional de home suman sólo **7.282.688B**. Sacrificar utilidad visible para obtener potencialmente7,3MB no resuelve la brecha. El tamaño pg_database_size tampoco acredita volumen libre/WAL, ni cuota de organización/promedio diario. [Supabase: Database and Disk Size](https://supabase.com/docs/guides/platform/database-size).

## Duplicado: unidad concreta que sí puede prepararse

Metadatos actuales: ambos btree, una key att14, opclass3127, collation0, opciones3, sin INCLUDE/expresiones/predicado/storage_options; mismo tablespace. Válidos/ready, no únicos, sin constraints ni objetos dependientes registrados. [evidencia.json](evidencia.json) conserva los campos y [metadatos-duplicado.sql](metadatos-duplicado.sql) la lectura exacta.

Origen: `supabase/migrations/20260304235643_initial_argen_prices_schema.sql:81` y `20260501172403_add_home_page_performance_indexes.sql:8`. Conservar la copia posterior desc_idx evita retirar la única ordenación usada por `src/lib/persistence/product-read.ts:87-91` y `:222-227`; las lecturas de guías también ordenan updated_at. No hay cambio de selección, fechas ni identidad.

Siguiente unidad recomendada: diff local que retire sólo la copia antigua, con verificación local de home/lectura por updated_at/guías/comparación/armador y matriz G02 sin cambiar muestras. Revisar planes representativos antes/después conservando estadísticas/fixtures comparables. Esta entrega no los ejecutó.

Rollback del contrato: recrear `products_updated_at_idx ON public.products USING btree(updated_at DESC)`, preservando los campos confirmados. Reconstruir consume tiempo/I/O/espacio y requiere autorización operativa; no es recuperación instantánea. DROP normal adquiere lock exclusivo; la variante concurrente tiene restricciones y no entra en transaction block. Coordinación debe elegir la operación tras revisión, no pegar DDL en el probe. [PostgreSQL: DROP INDEX](https://www.postgresql.org/docs/17/sql-dropindex.html), [CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html).

## Por qué no tomar los índices grandes como dinero libre

`price_history_offer_idx` ocupa44.728.320B y mantiene el acceso por oferta/tiempo (`20260824174500_catalog_integrity_and_offer_history.sql:59-60`). El EXPLAIN de mi probe anterior eligió ese índice; no afirma el índice efectivo del preflight de ingeniería. El preflight global-peer puede elegir otra ruta, por lo que price_history_product_store_idx necesita su propia comparación. Conservar variante/URL y keeper global es obligatorio; no trocarlo por una clasificación barata que cuente mal.

El helper producto/tienda/tiempo se creó en `20260501172403_add_home_page_performance_indexes.sql:20-21`. offer_idx introduce offer_url antes de recorded_at: compartir prefijo no garantiza la misma ordenación ni coste cuando coalesce(NULL/vacío) o varias URLs están presentes. El preflight materializado actual pasó según coordinación, pero eso no valida retirarle índices. Antes de reconsiderar el helper: planes de ese SELECT exacto y peers con múltiples ofertas, boundaries UTC y concurrencia; mismo número de candidatos. Rollback conserva su definición btree(product_id,store_id,recorded_at DESC).

`catalog_price_summaries_lookup_idx` ocupa23.650.304B y cubre resúmenes para no cargar heap ancho. `20260930142000_catalog_covering_indexes.sql:7-8` y las versiones vigentes de search_catalog_page establecen ese contrato. No se propone retirar rendimiento del lector principal para perseguir tamaño.

Los trigramas grandes por campos también siguen activos: `product-read-helpers.ts:71-100` hace OR ILIKE sobre name/brand/model/normalized_title/family_key/variant_key; `product-read.ts:173-197` los usa en guías por modelo. `seo/guide-catalog.ts:54-85` alimenta páginas y `catalog/priority-refresh.ts:32-36` el proceso prioritario. Comparativas editoriales usan esa lectura en `app/comparativa/[slug]/page.tsx:55-62`. No son una búsqueda opcional que pueda quitarse preservando G02/comparación; ni catalog_document convierte automáticamente esos SQL en equivalentes. No ampliar esta entrega a sustituir lectores.

## Alcance opcional real y decisión

El índice global de recorded_at se creó específicamente para caídas (`20260501172403_add_home_page_performance_indexes.sql:17-18`). La consulta `home/home-sections.ts:297-305` filtra por fecha/ordena/limita, y se ejecuta dentro de la lectura compartida antes de construir la sección (`:344-356`). `PriceDropSection.tsx:7-20` ya trata el bloque como opcional y `ObservedHomeSections.tsx:40-44` sólo representa bajas comprobadas.

Si dirección elige un alcance menor, el cambio coherente es omitir cálculo y representación de bajas históricas de home conservando selección reciente, búsqueda, comparación, armador, identidad y G02. No reemplazar bajas por productos arbitrarios ni anunciar una caída sin historia. Habría que conservar compatibilidad de la respuesta API y probar home/ruta/clientes; retirar su índice requeriría confirmar otros consumidores y planes. Rollback: restaurar función/render y su índice btree(recorded_at DESC). Coste monetario nuevo cero; coste de oportunidad: se pierde un descubrimiento útil de ofertas y sólo se libera potencialmente5,9MB.

**Mi recomendación:** preparar únicamente el duplicado exacto como pequeña unidad revisable, conservar los otros dos y mantener comparación+armador/G02. No quitar funciones de usuario ni rendimiento de retención para fingir una solución de capacidad. Costo cero con el alcance central aceptado es la decisión adoptada; esta evidencia no demuestra almacenamiento por debajo de cuota ni operación garantizada frente al límite de plataforma. Queda ese límite explícito; no seguir otra auditoría general de índices.

El preflight comunicado por coordinación (1000 examinadas,36 candidatas,147raw/futuras,0>365, cliente3183ms bajo límite SELECT3s) sólo acredita esa ventana. No es porcentaje ni estimación del historial global; no se usa en la aritmética anterior.

## Verificación y límites de entrega

Tres archivos propios: este PLAN, evidencia.json y metadatos-duplicado.sql. Validación JSON/igualdad estructural y aritmética; sin tests de aplicación/benchmark/build porque no hubo implementación. Ningún proceso persistente propio. Planes/tests pendientes quedan asociados a cada retiro o cambio de función, no se presentan como aprobados. Única consulta remota nueva: metadatos de dos índices; sin DDL/DML/ANALYZE/mantenimiento/pagos/refresh.
