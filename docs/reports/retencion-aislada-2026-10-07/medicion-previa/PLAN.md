# Historial: medición de compactabilidad al corte fijo

Estado: **conteo productivo desconocido**. Fuente informada: e420dc0, rama codex/retencion-comprobable; no se usó Git. Supabase project zyiyziubpcpgoqlkcrie quedó fijado explícitamente en cada llamada MCP. Corte de clasificación: **07/10/2026 15:45:00 UTC**; política 14 días raw, 90 horarios, 365 diarios, buckets UTC, identidad producto/tienda/coalesce(offer_url,'') y keeper recorded_at DESC/id DESC.

Esta entrega sólo escribe en esta carpeta. Coordinación mantiene publicación/operación; no hubo SQL mutante, DDL, RPC, limpieza, mantenimiento, refresh, índices, cambios de plan/cuenta ni lectura de datos privados.

## Medidas obtenidas

Metadatos efectivos a **15:49:51.164310 UTC**:

| Medida | Bytes |
|---|---:|
| pg_database_size(current_database()) |929.205.395 |
| Caché total |245.424.128 |
| Historial total |176.209.920 |
| Heap principal de historial |42.860.544 |
| Índices de historial |133.300.224 |

La función declara defaults 14/90/365; recorded_at es timestamptz NOT NULL, id uuid NOT NULL y offer_url nullable. Se fijó UTC localmente, no configuración global. pg_database_size es de esta base, no tamaño de todo el volumen/WAL ni cuota organizacional.

Restar hipotéticamente toda la caché deja **683.781.267 B**: aún 183.781.267 B sobre 500.000.000 B. Es aritmética sobre ocupación, no recuperación realizable. La cuota Free, disco y promedio organizacional son conceptos distintos. [Supabase: Database and Disk Size](https://supabase.com/docs/guides/platform/database-size).

## Tres consultas de candidatos y una planificación

| SQL ejecutado | Resultado | Round trip MCP |
|---|---|---:|
| agregado-global.sql: agrupar por hora y reagrupar por día |57014, statement_timeout |4904 ms |
| agregado-franjas.sql: sólo franjas y buckets completos relevantes |57014, statement_timeout |5150 ms |
| ventana-1000.sql: hasta1000 IDs internos por PK, keeper global EXISTS |57014, statement_timeout |4934 ms |
| explain-ventana.sql: EXPLAIN FORMAT JSON, ANALYZE FALSE |Plan recibido |2028 ms |

Todos usaron BEGIN READ ONLY, UTC y statement_timeout3s; terminaron con ROLLBACK. Ninguno exporta IDs, URLs, precios ni filas de negocio. Las duraciones son latencia cliente de herramienta: incluyen red/servicio y no equivalen a tiempo de CPU, I/O o ejecución del SELECT. Los errores acreditan cancelación por límite; no separan locks/CPU/I/O. No ampliar timeout ni asumir causalidad del tamaño por estas medidas.

Hubo además un 42803 inicial al validar GROUP BY del primer SQL: un CASE referenciaba límites constantes fuera de agregación. Se corrigió antes de ejecutar; no cuenta como medición ni prueba de costo. El tope de **tres consultas pesadas válidas** quedó agotado; no hay otro intento global ni de ventana.

| Resultado requerido | Estado |
|---|---|
| Total actual exacto y franjas raw/hourly/daily/old |Desconocidos en este corte |
| Candidatos horarios/diarios/>365 y total |Desconocidos |
| Candidatos raw |0 por contrato de política; no es un conteo observado |
| Candidatos positivos de la ventana como lower bound |No obtenidos; desconocidos |
| Filas restantes tras compactación |Desconocidas |
| Bytes físicamente recuperables |No medidos |

El conteo anterior de 248.397 filas a14:40 UTC no se presenta como conteo de este snapshot. Tampoco las franjas por edad miden duplicados por oferta/bucket. Desconocido no significa cero, ausencia de duplicación ni justificación para borrar.

## Hallazgo del plan de ventana

[plan-sanitizado.json](plan-sanitizado.json) conserva sólo nodos, nombres de relaciones/índices y estimates. Sample se resuelve mediante Limit1000/Index Scan price_history_pkey. Aggregate superior contiene **cinco SubPlans separados**, todos Index Scan price_history_offer_idx para el keeper. El CTE marked no materializado se inlinó y el EXISTS se repitió en distintos contadores.

Es amplificación confirmada del plan de este probe. EXPLAIN sin ANALYZE no entrega loops, buffers o tiempos efectivos; no demuestra que esa amplificación sea la única causa del timeout ni que una forma corregida cierre3s. Los costos del plan son unidades del optimizador, no milisegundos. No volver a ejecutar este SQL para buscar una cifra.

Se contrastó en lectura `docs/reports/retencion-aislada-2026-10-07/history-preflight.sql`, de ingeniería: limita todas las filas antes de clasificar y materializa classified/eligible, por lo que evita la repetición anterior. Ese preflight todavía necesita su propia comprobación productiva. Mi timeout no mide ni refuta su diseño. Su recibo contiene cursor/lastExaminedId: una medición agregada debe excluir esos campos de la salida según este encargo.

## Semántica y prueba sintética

El agrupamiento toma el bucket completo: si el keeper de un bucket que cruza14/90 días está en la franja más reciente, todas las filas antiguas de ese bucket pueden ser candidatas. COUNT(*)-1 sólo dentro de la franja antigua daría un conteo incorrecto. El desempate por id cambia qué fila sobrevive, pero no el número cuando recorded_at empata y pertenece a una misma franja. [PostgreSQL: date_trunc y timezone](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-TRUNC).

`python3 tmp/retencion-medicion-2026-10-07/fixture_conteos.py` pasó: equivalencia con referencia ordenada por recorded_at/id para agregados global/restringido y ventana que contrasta keeper global. Fixtures de25 y1588 filas, límites exactos/buckets cruzados/empates/NULL-vacío/URLs-tiendas-productos separados/offset UTC/futuras. La segunda ventana tiene1000 filas sintéticas. Los números en prueba-sintetica.json son **sintéticos**, sin valor de timing o compactabilidad productiva. No se inició PG local, build ni procesos persistentes.

## Decisión y costo de oportunidad

Recomiendo preparar y probar **el preflight materializado de ingeniería**, con salida exclusivamente agregada y dentro de un nuevo presupuesto de lectura explícito de coordinación. Cierre mínimo: conteo reconciliado de una ventana, keeper global correcto y duración medida bajo3s; el total sigue desconocido hasta cobertura demostrada. No ejecutar cleanup_price_history completo ni maintenance usando este resultado incompleto.

Reutilizando inventario de39 índices a15:18:55 UTC, una copia del par products_updated_at_idx/products_updated_at_desc_idx ocupa1.400.832B y tiene definición visible duplicada. Revisarlo localmente es una unidad pequeña viable, pero no cierra183,8MB residuales. No gastar una auditoría general de índices para compensar una cifra desconocida de historial.

Recuperación física queda detrás de conteos/retención autorizada y evaluación de margen de disco, locks y ventana. DELETE no contrae por sí solo; VACUUM ordinario reutiliza y FULL reescribe con lock/espacio adicional. [PostgreSQL: recuperación física](https://www.postgresql.org/docs/17/routine-vacuuming.html#VACUUM-FOR-SPACE-RECOVERY). No multiplicar porcentaje de filas candidatas por bytes de tabla. Costo monetario nuevo cero; costo real de estas alternativas: implementación/pruebas, I/O y posible interrupción. Sin evidencia de ahorro y margen, capacidad bajo500MB permanece abierta.

## Archivos

evidencia.json, metadata.sql, agregado-global.sql, agregado-franjas.sql, ventana-1000.sql, explain-ventana.sql, plan-sanitizado.json, fixture_conteos.py, prueba-sintetica.json y este PLAN. JSON/prueba verificados; fuente productiva y archivos de ingeniería preservados. Ninguna operación ni ajuste remoto queda autorizado por este informe.
