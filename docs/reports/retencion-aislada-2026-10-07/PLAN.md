# Historial: piloto aislado preparado para revisión

Estado: **propuesta y pruebas locales; ejecución remota no autorizada ni lista**. Base de trabajo `e420dc0`, rama `codex/retencion-comprobable`, copia `comparador-confianza/comparador-hardware-argentina`. El recibo del wrapper integrado en `0ba14fc` y el piloto previo de caché son entregas distintas: ninguno autoriza esta operación. Jonathan autorizó preparar la recomendación, no borrar historial ni publicar código.

Recomendación: conservar el SQL aislado y solicitar primero un presupuesto concreto para su preflight de lectura. Si completa dentro de tres segundos, no presenta efectos secundarios ni incompatibilidad de permisos y devuelve una ventana útil, presentar hasta cuatro lotes/1000 borrados para autorización específica. Si vuelve a agotar el tiempo, detenerse y resolver el plan medido antes de pedir permiso de borrado. No aumentar timeout, instalar índices, ejecutar el endpoint `cleanup-history` ni cambiar planes para hacer pasar este piloto.

AGENTS y contratos de esta copia fueron leídos. `docs/direccion/README.md` está ausente aquí; la dirección se consultó en el checkout principal. La guía PostgreSQL aplicada recomienda cursor por índice y transacciones cortas. No cambian la política ni la arquitectura del servicio.

## Operación concreta

[history-pilot.sql](history-pilot.sql) es SQL standalone sin función persistente, DDL, RPC ni endpoint. El único DML es `DELETE FROM public.price_history`. No llama `pruneGhostStorePrices`, no modifica productos/ofertas/usuarios ni renueva precio, stock o fechas. El guard rechaza triggers DELETE de usuario habilitados, reglas DELETE y acciones referenciales salientes de cascada/set-null/set-default; una instalación que los tenga requiere revisión separada. Los permisos/grants/RLS actuales se conservan, no se corrigen automáticamente.

Corte fijo: **2026-10-07 15:45:00 UTC**. Política por `(product_id, store_id, coalesce(offer_url,''))`, con orden `recorded_at DESC, id DESC`:

| Franja respecto del corte | Regla |
|---|---|
| Desde 14 días, inclusive | Conservar todas las observaciones, también futuras; una fecha futura conservada no se certifica como válida |
| Desde 90 días inclusive hasta antes de 14 | Conservar la última observación de cada hora UTC |
| Desde 365 días inclusive hasta antes de 90 | Conservar la última observación de cada día UTC |
| Antes de 365 días | Elegible para eliminación por retención |

Los límites exactos son `2026-09-23T15:45:00Z`, `2026-07-09T15:45:00Z` y `2025-10-07T15:45:00Z`. La búsqueda del keeper cubre **todo el bucket**, incluso una observación que quede en una franja más reciente o fuera de la ventana de IDs. Por eso no conserva un falso último registro de la franja antigua cuando el último real está a otro lado de 14/90 días. URL nula y vacía se agrupan como el contrato vigente; otras URLs, tiendas y productos permanecen separados.

## Ventana, bloqueos y recibo

Cada lote examina como máximo **1000 filas por PK UUID** a partir del cursor, incluyendo recientes, antes de clasificar; elimina como máximo **250 candidatas**. `classified` y `eligible` son CTE MATERIALIZED: los contadores no recalculan el lateral del keeper. Se reutilizan los índices vigentes; no se crean índices nuevos. El mínimo UUID permite comenzar también si existe una fila con ID cero.

La ventana limita filas entregadas a clasificación, **no** todas las entradas de índices/heap que puede explorar cada búsqueda de keeper. No hay ranking global en el piloto. El presupuesto real sigue siendo `statement_timeout='3s'` por sentencia, `lock_timeout='200ms'` e idle de diez segundos. No prometer un costo constante de tres segundos para todo el script ni extrapolar tiempos sintéticos a producción.

La transacción es REPEATABLE READ en UTC. Bloquea keepers con FOR SHARE y hasta 250 candidatas con FOR UPDATE, sin SKIP LOCKED. SHARE impide mover o borrar la observación que justifica eliminar un duplicado. Un conflicto de bloqueo o una modificación concurrente de una fila seleccionada aborta el lote; no se salta esa fila ni se avanza el cursor. Inserciones concurrentes pueden quedar fuera del snapshot y se conservan; no se usa una igualdad entre conteos globales antes/después para juzgar el resultado.

El recibo conserva timestamp del servidor, corte/política, límites, ordinal y total previo informado por operador, `examinedRows`, `candidateRows`, `selectedRows`, `deletedRows`, `batchComplete` y cursores. Si las candidatas exceden 250, el cursor propuesto es el último ID borrado; en caso contrario, el último ID examinado. Si selección/borrado no completan, el cursor permanece y un DO posterior **aborta la transacción antes del terminador**. El recibo previo puede haberse emitido: el error posterior prevalece y esos borrados no se presentan como commits. La guarda usa sólo un ajuste transaccional para el recibo, sin crear tablas o funciones.

`scanReachedEndAtSnapshot` se refiere sólo al tramo después del cursor en ese snapshot. `globalEligibilityUnknown=true` se conserva siempre. UUID no representa orden temporal: una inserción nueva con ID menor que el cursor puede quedar pendiente. Cero candidatas, un tramo terminado o una muestra completa no acreditan agotamiento global ni recuperación de capacidad.

## Procedimiento pendiente de autorización

1. Coordinación revisa diff y pruebas. [history-preflight.sql](history-preflight.sql) es una lectura agregada acotada con ROLLBACK; no exporta IDs/cursor, productos/precios/URLs ni carga de usuarios. Los IDs de cursor del piloto son metadatos operativos privados, excluidos del preflight a pedido de coordinación. Comprobar proyecto, rol, permisos SELECT/UPDATE/DELETE existentes —UPDATE es necesario para los locks—, índices, triggers/reglas/cascadas, lectura/escritura y respuesta completa.
2. Obtener autorización separada para la lectura productiva si no está ya incluida en el encargo de medición. Si timeout o error, candidatos quedan **desconocidos**, nunca cero. Este agente no ejecutó el preflight ni el piloto en remoto.
3. Presentar tabla, política, corte fijo, ventana1000, 250/lote, máximo cuatro commits/1000 y pérdida de observaciones. La autorización de historial es nueva y no reutiliza la del piloto terminado de caché. No esperar aprobación con transacción abierta.
4. Sólo tras autorización, el operador configura en la sesión el marcador `app.history_cleanup_approved='history-retention-2026-10-07-v1'`, ordinal `app.history_cleanup_batch`, total previo `app.history_cleanup_prior_deleted` y cursor `app.history_cleanup_cursor`. Marcador y rol no sustituyen autorización humana. El archivo termina en **ROLLBACK**: cualquier ensayo autorizado con ese terminador no elimina filas de forma durable ni habilita avanzar el cursor de ejecución.
5. Preparar/revisar la variante exacta de COMMIT antes de ejecutar. Una única sesión de operador, sin paralelizar lotes ni scheduler. Conciliar ACK de la transacción, recibo, ordinal y conteo antes del siguiente lote. Máximo cuatro commits, incluidos lotes de cero, y 1000 filas; el ledger no es persistente ni evita que una persona vuelva a declarar ordinal1. El guard limita ordinal/total declarado, no otorga autoridad para reiniciarlo.
6. Detenerse ante timeout, lock, serialización, guarda, recibo incompleto, más de 250 borrados, más de 1000 examinadas, corte/política distintos o respuesta perdida. No reintentar una ejecución con COMMIT incierto ni reutilizar su cursor sin conciliación. Una llamada fallida o un recibo ausente no demuestra rollback remoto.
7. Realizar sólo la postlectura expresamente autorizada, con los mismos cortes y límites. Registrar tamaños físicos como medidas separadas de filas. Sin VACUUM/ANALYZE, nuevas limpiezas, índices, migraciones, refresh ni cambios de plan.

## Reversión y capacidad

Antes de COMMIT, ROLLBACK conserva las filas; timeout/error deja la transacción abortada. Una pérdida de conexión durante COMMIT necesita conciliación. Después de COMMIT **no hay restauración demostrada**: las observaciones históricas no se reconstruyen reconsultando las tiendas y no se inspeccionaron backups/PITR. Si archivar/restaurar es requisito, detenerse antes de aprobar el borrado y definir ese encargo aparte.

DELETE genera tuplas muertas/WAL y permite reutilización posterior; no demuestra reducción del tamaño de la relación o de cuota. Borrar1000 no acredita capacidad resuelta. La memoria histórica del proyecto aporta este límite, corroborado en el reporte previo de retención; no se reutilizan sus tamaños como medición nueva propia.

## Evidencia y límites actuales

[evidencia-local.json](evidencia-local.json) fue generado por [test-history.mjs](test-history.mjs) y [fixture-history.sql](fixture-history.sql) en PG17.11 propio, `127.0.0.1:55484`, base `history_retention_local`; registra la ruta de datos y parada del cluster. El harness sólo admite ese puerto/base local, evita arrancar si el puerto ya está ocupado, inicia un directorio propio nuevo, no carga credenciales/env del proyecto y detiene exclusivamente sus procesos. Se reproduce con `node docs/reports/retencion-aislada-2026-10-07/test-history.mjs`; requiere los binarios PG17 existentes en `/opt/homebrew/opt/postgresql@17/bin`, sin instalación.

La fixture semántica tiene30 filas,11 elegibles contrastadas con un ranking independiente completo **sólo sintético**. ROLLBACK preserva todos los campos. El commit sintético elimina exactamente las11 esperadas y conserva19, incluidas fronteras, raw/futuras, variantes URL, producto/tienda, null/vacío, empates por ID y fechas bisiestas/offsets UTC. Fixture masiva1501: cuatro commits250 eliminan1000 y dejan501, incluido el keeper fuera de ventana. Otra ventana1000 recientes informa cero y no termina el tramo; el siguiente cursor encuentra una antigua adicional.

Se probaron bloqueo de candidata y keeper, modificación concurrente de candidata, inserción concurrente, timeout3s, falta de autorización/rol/ledger, efectos secundarios y DELETE filtrado por RLS sintética. Las políticas de ese test sólo se crearon en el cluster propio. Productos, precios, tiendas y usuarios sintéticos permanecen idénticos. El plan local no contiene WindowAgg; no mide la carga ni el plan real de Supabase.

Lectura del otro frente, artefacto `tmp/retencion-medicion-2026-10-07/evidencia.json`, 07/10/2026 15:54:54 UTC: dos agregados globales y una ventana de otra consulta agotaron3s (57014), sin conteos. Su EXPLAIN sin ANALYZE muestra cinco SubPlans del keeper debido a inlining; nuestro diseño materializa el cálculo y limita todas las filas antes de clasificar. Ese timeout no prueba que el nuevo preflight falle, y el test local no prueba que complete. **Readiness productiva continúa pendiente**, sin nuevo presupuesto de lecturas usado desde esta unidad.

Contratos revisados: `src/lib/persistence/price-history-retention-policy.ts:1-17`; función SQL `supabase/migrations/20260824174500_catalog_integrity_and_offer_history.sql:62-125`; esquema `supabase/migrations/20260304235643_initial_argen_prices_schema.sql:70-86`; índice producto/tienda/fecha en `20260501172403_add_home_page_performance_indexes.sql:20-21`. Reporte previo `docs/reports/retencion-2026-10-07/PLAN.md` distingue operación aislada, borrado físico y el endpoint que también poda ofertas. No se cambia ninguno de esos contratos.

Entrega de este frente: únicamente estos seis archivos; datos/logs del cluster propio quedan en el tmp asignado y detenido. Sin src, migraciones, workflows, Git staging/commit/switch, HTTP, DB/RPC remoto o publicación. Siguiente acción: revisión independiente y de coordinación; después decidir un preflight productivo acotado como lectura separada, antes de presentar el piloto mutante para aprobación.
