# Capacidad: opciones y límites para revisión

Estado: diagnóstico terminado; capacidad abierta. Este es el corte de inspección de 12:17–12:19 Santiago. El piloto terminó después; su resultado se conserva en [la ejecución](../ejecucion/README.md). Referencia publicada informada por coordinación: `99d5917`; fuente local comprobada: `8f759a8cf492ade26c579f41057716db6ec697d6`. Cortes Supabase MCP del **07/10/2026, 15:17:00 y 15:18:55 UTC / 12:17–12:19 Santiago**. Escritura limitada a esta carpeta. Coordinación conserva la ejecución del piloto autorizado de hasta 1000 eventos; esta investigación no ejecutó operaciones mutantes.

Se leyeron AGENTS y la dirección vigente de la copia principal. `docs/direccion/README.md` no existe en la worktree asignada; ese contexto no cambia las referencias de código ni autoriza nuevas operaciones. Se reutiliza evidencia fechada de retención, sin repetir consultas de filas.

## Qué explica el espacio restante

[evidencia.json](evidencia.json) retiene medidas sanitizadas y definiciones de índices. Dos consultas de metadatos, BEGIN READ ONLY y statement_timeout de tres segundos: sin payloads, claves, precios individuales, usuarios ni credenciales. Se ordenaron únicamente metadatos de relaciones/índices, sin barridos ni sorts de filas de negocio.

| Relación | Total B | Heap principal B | Índices B |
|---|---:|---:|---:|
| products | 236.101.632 | 73.424.896 | 162.562.048 |
| price_history | 176.209.920 | 42.860.544 | 133.300.224 |
| catalog_price_summaries | 118.177.792 | 65.798.144 | 49.922.048 |
| product_prices | 101.376.000 | 38.748.160 | 62.578.688 |
| **Cuatro relaciones** | **631.865.344** | **220.831.744** | **408.363.008** |
| api_cache_entries | 245.424.128 | 158.253.056 | 77.922.304 |

Total de DB: **929.205.395 B**. Restar aritméticamente TODA la relación de caché deja **683.781.267 B**, aproximadamente 683,8 MB decimales; aún faltan 183.781.267 B para llegar a 500.000.000 B. Esto es una hipótesis favorable, no ahorro disponible: la caché contiene filas activas y DELETE no devuelve automáticamente sus bytes físicos.

Otras relaciones públicas visibles: catalog_offer_refresh_state 15.704.064 B, product_title_normalizations 11.640.832 B, catalog_inventory_listings 8.372.224 B y catalog_refresh_runs 1.359.872 B. No son caché intercambiable: la cola/estado e inventario forman parte de cobertura, retries e identidad. El último tiene retención de 30 días en `src/lib/catalog/adaptive-refresh.ts:36-38`; su tamaño no cierra la brecha.

El schema public ocupa 915.169.280 B. Metadatos de auth y storage ocupan respectivamente 1.458.176 y 253.952 B; no hay argumento de capacidad para tocar usuarios. Los 11 catálogos compartidos suman 704.512 B y se muestran aparte: no reconciliar sumando todas las relaciones compartidas contra el tamaño de una sola base. Tampoco esta consulta asigna individualmente secuencias y otros archivos; los cortes no son un único snapshot y hay actividad concurrente.

## Tamaño, cuota y mantenimiento son medidas distintas

`pg_database_size(current_database())` mide archivos de esta base. `pg_total_relation_size` incluye heap, índices, TOAST y forks auxiliares; heap principal e índices ya están dentro del total. El residuo entre esas columnas no equivale a desperdicio. [PostgreSQL 17: tamaños](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-DBSIZE).

Supabase distingue cuota Free de 500 MB de base y disco incluido de 1 GB; su reporte puede sumar bases del cluster. La cuota organizacional también considera el promedio diario del período. Por eso este corte de una base y `default_transaction_read_only=off` no certifican cumplimiento ni ausencia de restricción. [Supabase: Database and Disk Size](https://supabase.com/docs/guides/platform/database-size).

DELETE libera filas lógicamente. VACUUM ordinario permite reutilizar espacio; la reducción de archivo requiere condiciones específicas. VACUUM FULL reescribe, pide lock exclusivo y espacio adicional, y puede afectar consultas. No se ejecutó ni se estimó el ahorro por proporción de filas. [PostgreSQL 17: recuperación de espacio](https://www.postgresql.org/docs/17/routine-vacuuming.html#VACUUM-FOR-SPACE-RECOVERY).

## Tres opciones preparables

| Opción | Impacto sustentado | Costo monetario nuevo | Riesgo y condición para avanzar |
|---|---|---:|---|
| 1. Revisión acotada de índices, empezando por el par duplicado visible | Una copia de products_updated_at_idx/products_updated_at_desc_idx ocupa 1.400.832 B. Ambos tienen definición visible btree(updated_at DESC), son válidos, no únicos y no sostienen constraints en pg_constraint. Es un candidato concreto; no resuelve capacidad. Los otros 408,4 MB de índices de las cuatro relaciones requieren contratos y planes, no una poda general. | 0, si se prepara y prueba localmente | Comparar opciones, opclasses, collations, dependencias y planes de home/catálogo antes de proponer un DROP revisable. La reconstrucción de un índice retirado requiere tiempo, espacio y autorización. No retirar PK, uniques, FKs o índices de frescura/identidad por tamaño. |
| 2. Retención de historial aislada, acotada y con recibo | La política vigente permite compactar observaciones por oferta sin borrar precios actuales. Ocupación actual de toda la relación: 176.209.920 B; ahorro desconocido. Hay ejecución histórica pero no recibo reciente con deletedRows. Preparar esa operación evita crecimiento retenible y hace medible su resultado. | 0; esfuerzo de implementación/prueba | La función vigente rankea todo el historial en una transacción; no lanzarla como emergencia de espacio. Preparar lotes con corte fijo y recibos que preserven producto/tienda/offer_url, la última observación por bucket, fechas reales y límites 14/90/365. El descarte autorizado por política pierde granularidad histórica; backup y autorización se evalúan antes de ejecutar. |
| 3. Plan de recuperación física posterior a retención autorizada | Puede devolver espacio físico que DELETE dejó reutilizable. Caché total 245,4 MB es tamaño ocupado, no ahorro garantizado. Incluso recuperar cada byte de caché no alcanza 500 MB. | 0 de suscripción; costo operativo y posible ventana de interrupción | Preparar ventana, locks tolerables, espacio temporal/disco/WAL, respaldo recuperable y medidas antes/después. No ejecutar FULL sin margen real demostrado; reescribir cerca del límite puede fallar. VACUUM ordinario tampoco acredita reducción suficiente. No truncar toda la caché ni la cola para cerrar el número. |

Esta lista ofrece acciones preparables, no una garantía de que la política de costo cero alcance la cuota. Su viabilidad operativa depende de medidas pendientes y autorización distinta del piloto.

## Qué sabemos sobre los índices

La evidencia registra 39 índices de las cuatro relaciones, su tamaño, definición, validez, constraints e idx_scan. El par de updated_at deriva de `supabase/migrations/20260304235643_initial_argen_prices_schema.sql:81` y `20260501172403_add_home_page_performance_indexes.sql:8`. La igualdad visible es la mejor primera unidad de revisión, aunque su ahorro es pequeño.

`price_history_product_store_idx`: 33.030.144 B y 0 scans registrados; `product_prices_sitemap_eligible_idx`: 6.201.344 B y 0; `products_family_key_idx`: 1.990.656 B y 0. Son candidatos a estudiar uso, no índices aprobados para retirar. El reset de estadísticas de la base se devolvió null y no existe período de cobertura garantizado. No multiplicar ni interpretar idx_scan como consultas o relevancia de negocio. [PostgreSQL 17: estadísticas de índices](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ALL-INDEXES-VIEW).

El índice de historial por oferta incluye offer_url antes de recorded_at; el índice por producto/tienda no. No son duplicados exactos y el primero no garantiza el mismo orden por tiempo si se consultan varias URLs. El índice product_prices_product_id_idx registra 140.310.475 scans; el unique(product_id,store_id,url) comparte prefijo pero es más ancho y cumple otro contrato. Retirar índices sólo por prefijo puede cambiar I/O/CPU, sorts y latencia; no hacer ese intercambio sin comparación local. Los covering de seed aún no están en este inventario remoto.

## Retención: ejecución histórica, cadencia no demostrada

Evidencia previa de hoy, `tmp/retencion-2026-10-07/evidencia.json`, 14:40–14:42 UTC: 248.397 observaciones; 36.292 <=14 días, 61.716 entre 14 y 90, 150.389 entre 90 y 365, ninguna >365. No se contaron duplicados horarios/diarios; esas edades no prueban ahorro. El historial empieza el 05/03/2026, por lo que ausencia de >365 días no demuestra purga.

pg_stat_statements conserva dos formas de llamada a cleanup_price_history, 27 llamadas y 36.074 ms acumulados desde reset 04/03 23:47 UTC. Eso demuestra llamadas históricas, no fecha última, commits, deletedRows o cadencia. track_functions=none tampoco prueba que nunca corrió.

Contrato local: `src/lib/persistence/price-history-retention-policy.ts:1-17`, 14 días raw /90 horarios /365 diarios; implementación final `supabase/migrations/20260824174500_catalog_integrity_and_offer_history.sql:62-125`, security definer, EXECUTE de service_role y sin permiso EXECUTE para anon/auth según metadatos efectivos del corte anterior. Mantener UTC al validar buckets: date_trunc depende de timezone.

Los cron actuales eligen priority/guides; el modo cleanup-history está disponible manualmente. `src/lib/admin/catalog-refresh/route-handler.ts:18-20` encadena limpieza de historial y pruneGhostStorePrices. **No usar ese endpoint para una autorización limitada a historial**, porque también elimina ofertas actuales. Además `price-history-maintenance.ts:40-47` sustituye campos faltantes por cero/hora actual; un resumen construido no reemplaza recibo del servidor.

## Recomendación y cierre esperado

1. Completar y registrar exclusivamente el piloto ya autorizado en coordinación. Su criterio es conservar activas/renovadas y respetar 1000 filas; no declararlo solución de cuota.
2. Asignar una unidad local pequeña para contrastar el par duplicado de updated_at y preparar su diff/rollback. Si el impacto real es sólo 1,4 MB, no gastar una auditoría amplia para fingir que cierra una brecha de 183,8 MB.
3. Preparar retención de historial aislada y acotada, con recibos válidos del servidor; medir candidatos mediante pruebas sintéticas y un eventual agregado aprobado. Sólo después dimensionar recuperación física/ventana. No publicar schedules ni lanzar maintenance como parte de esta lectura.

Si esos pasos no demuestran al menos la brecha residual y margen para crecimiento, informar que **capacidad bajo 500 MB con costo cero sigue sin solución comprobada**. No recortar catálogo, resumen de lectura, fechas, identidad, usuarios ni denominadores para sostener esa promesa. La condición de cierre futura exige tamaño de base/cuota medidos después, conservación de contratos y ausencia de regresión de rutas críticas; todavía no existe.

## Archivos y verificación de esta entrega

Sólo `tmp/capacidad-siguiente-2026-10-07/`: este PLAN, evidencia.json e inspeccion-indices.sql. El SQL reproduce la segunda lectura de metadatos y termina en ROLLBACK; no contiene DDL ni DML mutante. Evidencia JSON validada y aritmética contrastada; sin tests de aplicación, build, benchmark o PostgreSQL local porque no se modificó implementación. No se inició ningún proceso propio ni se usó el cluster anterior. No hay ahorro físico ni resultado de retención nuevo que reportar.
