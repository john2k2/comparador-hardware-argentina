# Capacidad y retención: piloto para revisión

Copia asignada: `comparador-confianza/comparador-hardware-argentina`, revisión fuente `53d471e08812189fbc86297df2ec112bd4638aba`. Lecturas Supabase MCP: **07/10/2026, 14:39–14:42 UTC / 11:39–11:42 Santiago**. Encargo limitado a esta carpeta: inspección, propuesta y prueba sintética. Jonathan autorizó publicar fuentes/diagnóstico; **no autorizó limpiar datos ni aplicar índices**.

AGENTS fue leído; `docs/direccion/README.md` sigue ausente en esta copia. Las consultas remotas usaron BEGIN READ ONLY y statement_timeout de tres segundos por sentencia. Se obtuvieron exclusivamente metadatos/agregados, sin payloads, cache_key, términos ni datos de usuarios. Los scopes desconocidos se agruparon. No hubo borrados, vacuum/analyze, DDL, RPC mutante, refresh, cambios de cuenta/plan o lectura de credenciales.

## Operación propuesta

Primer piloto: **hasta 1000 filas de `operational-store-event`, en máximo cuatro transacciones de 250**, con `expires_at < '2026-10-07T14:30:00Z'` y `updated_at <=` ese mismo corte. El corte queda fijo durante toda la operación. Esto no autoriza eliminar las 346.653 filas vencidas.

[cache-vencida-piloto.sql](cache-vencida-piloto.sql) contiene un bloqueo de aprobación, allowlist/corte/lote fijos, FOR UPDATE SKIP LOCKED, revalidación del predicado al borrar y **ROLLBACK por defecto**. No crea objetos ni modifica roles/RLS. SQL impone el máximo 250 por lote; el límite total de cuatro commits/1000 se controla mediante el registro del operador. No existe un contador persistente en este borrador. No automatizarlo ni despacharlo mediante refresh.

Se propone empezar por telemetría cuyo TTL de 48 h ya venció y que los lectores actuales excluyen. El piloto conserva activas, renovadas y otras clases de datos. Sin embargo, las filas borradas son registros históricos: aceptar su vencimiento no permite prometer que podrán reconstruirse posteriormente.

## Evidencia y espacio

[evidencia.json](evidencia.json) conserva fechas, fuente, consultas agregadas y limitaciones.

| Medida | Resultado | Interpretación |
|---|---:|---|
| Tamaño de DB |929.205.395 B |Tamaño reportado por PostgreSQL; no volumen total de disco/WAL |
| Caché total |245.424.128 B |Heap, TOAST, índices y forks; no espacio recuperable mediante DELETE |
| Heap de caché |158.253.056 B |Relación principal |
| Índices de caché |77.922.304 B |Incluidos en el total; no sumarlos nuevamente |
| Historial total / heap |176.209.920 / 42.860.544 B |Gran parte de su espacio reside fuera del heap principal |
| Caché total / vencida al corte |348.342 / 346.653 filas |Conteos exactos del snapshot de 14:39:40 UTC |
| Store-event total / elegible |331.716 / 330.295 |Scope del piloto, vencimiento y actualización antes del corte |
| Endpoint-event total / vencido |14.077 / 14.075 |Fuera del primer piloto |
| Demanda total / vencida |367 / 115 |Fuera del piloto por su semántica de contador |
| Scopes desconocidos vencidos |2029 |Fuera del piloto; no se exportaron sus claves ni nombres |

El corte previo de coordinación, `docs/reports/fiabilidad-tiendas-2026-10-06/capacidad.json`, registró 03:05 UTC: DB 926.215.315 B, caché 245.334.016 B y 346.397/347.944 filas vencidas. Free procede de ese corte; no se volvió a consultar ni cambiar el plan. `default_transaction_read_only=off` sigue observado en el corte nuevo, pero no acredita margen de cuota ni ausencia de restricciones de plataforma.

Incluso la hipótesis favorable de retirar toda la relación de caché y recuperar cada byte dejaría **683.781.267 B (~683,8MB decimales)** en DB. Sigue por encima de 500 MB, incluso distinguiendo MB de MiB. El piloto de 1000 no pretende cerrar capacidad.

DELETE elimina filas lógicamente y genera tuplas muertas/WAL; por sí solo no contrae la relación y sus índices. VACUUM ordinario permite reutilizar espacio y puede truncar páginas finales vacías; no garantiza devolver todo al filesystem. VACUUM FULL reescribe y bloquea, puede exigir espacio temporal y queda fuera de esta operación. No estimar ahorro multiplicando proporción de filas vencidas por tamaño físico.

Último autovacuum de caché observado: 02/10 22:44 UTC; último autoanalyze: 25/08. Los estimados 338.600 filas vivas/881 muertas difieren del conteo exacto. Es un límite de estadísticas; no autoriza cambios de autovacuum/configuración.

Fuentes oficiales consultadas 07/10: [Supabase: Database and Disk Size](https://supabase.com/docs/guides/platform/database-size), [PostgreSQL 17: Routine Vacuuming](https://www.postgresql.org/docs/17/routine-vacuuming.html), [PostgreSQL 17: DELETE](https://www.postgresql.org/docs/17/sql-delete.html). La documentación distingue la cuota Free de 500 MB, tamaño DB/disco y recuperación física; no reemplaza comprobaciones de la cuenta ni concede permiso operativo.

## Contratos que delimitan el borrado

- `src/lib/server/shared-cache.ts:133-147`: lee por clave y borra en lectura cuando vence. TTL en memoria/Redis y la columna expires_at no constituyen una purga SQL global. `:206-225` escribe mediante upsert no bloqueante. El borrado existente por clave no revalida expiry y podría competir con una renovación; el candidato sí revalida corte/actualización bajo lock. Hallazgo documentado, sin editar fuente.
- `src/lib/metrics/constants.ts:1-7`: límites de 1500/1000, ventana de 24 h y TTL de 48 h. `src/lib/metrics/storage.ts:38-52` y `src/lib/measurement/providers.ts:171-172` exigen `expires_at > now`. Los eventos vencidos del piloto ya no participan en el panel. No se modifica su política.
- `src/lib/catalog/refresh-demand.ts:62-79`: lee el contador anterior sin filtro de vencimiento y lo renueva por 14 días. El lector de priorización en `:110-114` sí filtra expiry. Borrar demanda vencida puede resetear el acumulado cuando vuelva esa consulta; se excluye.
- `src/lib/measurement/store.ts:8-9,25,67`: mediciones, conexiones y decisiones actuales usan `measurement_dashboard_entries`, explícitamente excluida. No se tocaron sus datos ni autorizaciones.
- También se excluyen `jev-identity-offer`, `eneba-affiliate-pilot`, circuitos, respuestas home/search y scopes desconocidos. Borrar revisión podría provocar recomputación/coste; “cache” no implica que todo sea descartable.
- Tabla real: PK cache_key, índices scope/expiry y RLS habilitado. Aunque anon/auth tienen el grant SQL DELETE, las cuatro políticas observadas son sólo service_role; el grant aislado no prueba acceso público efectivo. Operador futuro: service_role o sesión postgres autorizada, sin nuevos grants/RLS ni función security-definer pública. El marcador del borrador no reemplaza autorización humana.

## Retención de price_history

Política de código: 14 días raw, 90 horarios, 365 diarios (`src/lib/persistence/price-history-retention-policy.ts:1-17`). Función final en `supabase/migrations/20260824174500_catalog_integrity_and_offer_history.sql:62-125`: particiona por producto, tienda, offer_url y hora/día; conserva la última observación del bucket y elimina duplicados o antigüedad>365d. Es una transacción sobre todo el historial, sin lotes. No renueva fechas ni acredita stock/identidad. `date_trunc` depende de timezone de sesión; conservar UTC al auditar, sin cambiar política.

Función efectiva: security-definer; service_role tiene EXECUTE, anon/auth no. `track_functions=none` y pg_stat_user_functions sin contador no significan que nunca corrió. **pg_stat_statements retiene dos formas de llamada, 27 ejecuciones y 27 filas de respuesta**, con 36.074 ms acumulados. Reset general: 04/03 23:47 UTC. Esto acredita ejecución histórica; no conserva fecha última, deletedRows ni cadencia. Los registros pueden ser expulsados y no constituyen un historial completo de runs.

Snapshot 14:40 UTC respecto del corte 14:30 UTC: 248.397 filas; 36.292 en 14 días, 61.716 entre 14–90, 150.389 entre 90–365 y 0 más antiguas que 365. La más antigua es 05/03/2026: la plataforma tiene menos de 365 días, por lo que ese cero no prueba purga. No se calcularon duplicados por bucket ni ahorro potencial: se evitó otro barrido/sort de historial en la DB excedida.

Workflow `catalog-refresh.yml:40-45,104-119`: los crons sólo resuelven a priority/guías. `cleanup-history` existe en workflow_dispatch (`:15,:148-149`), sin schedule propio. No aparece pg_cron instalado en el corte. No se consultaron cuentas/chats adicionales o GitHub autenticado: falta runid, fecha y artefacto reciente. Conclusión: **ejecución histórica demostrada; retención periódica vigente no demostrada**.

Riesgo concreto: `src/lib/admin/catalog-refresh/route-handler.ts:18-20` ejecuta retención y `pruneGhostStorePrices()`. Esta última recorre productos/ofertas y borra ofertas mediante RPC (`stale-product-prices-maintenance.ts:69-97`). No despachar ese endpoint como limpieza aislada de historial/caché. El wrapper de retención rellena contadores ausentes con cero y executedAt con la hora actual (`price-history-maintenance.ts:40-47`); esa normalización no prueba efectos de escritura. Una reparación de retención necesita una unidad propia con pruebas de buckets, offer_url, fechas y ejecución separada.

## Procedimiento para revisión y aprobación

1. Presentar operación concreta: tabla, scope, corte, 250 por lote, máximo 4 commits/1000 y pérdida de historial vencido. Hasta autorización humana específica, no ejecutar el SQL mutante contra producción, ni siquiera con ROLLBACK. [preflight.sql](preflight.sql) es una lectura agregada separada.
2. Confirmar proyecto, permisos/RLS, acceso de escritura y medidas. Si hay read-only/error de capacidad, parar y escalar; no desactivarlo automáticamente ni aplicar índices como parte de este piloto.
3. Usar una única sesión de operador y el mismo corte/allowlist. Activar el marcador sólo después de aprobación. Registrar por lote UTC, ordinal, límite, deletedRows, elapsed y error sanitizado. Si se ensaya ROLLBACK tras autorización, revisar resultado y terminar la transacción antes de decidir COMMIT. No esperar aprobación con transacción abierta.
4. Parar ante error/timeout, >250 reportado, ausencia de ACK o guarda violada. No reintentar un commit de respuesta perdida sin conciliar estado. Tope de cuatro commits/1000 aunque queden 330 mil pendientes. Cero puede significar filas bloqueadas/diferidas; no declara vacío todo el scope.
5. Postlectura con los mismos cortes: elegibles, activas/renovadas, conteos y tamaños físicos. Una caída del conteo no acredita espacio reclamado ni estabilidad pública. No añadir vacuum/analyze, schedules o configuración al paso final.

Reversión: antes de COMMIT, ROLLBACK conserva las filas. Después no hay restauración demostrada: la telemetría histórica no se regenera consultando tiendas y backups/PITR no se inspeccionaron. Exportar un backup privado sería otro alcance y podría incluir payloads. No reconstruir eventos con fechas inventadas. El piloto requiere aceptar la pérdida de hasta 1000 registros cuyo TTL venció; si archivar es requisito, parar antes del borrado.

## Prueba local y cierre

[prueba-local.json](prueba-local.json) / [prueba-local.log](prueba-local.log): PG 17.11 propio, 127.0.0.1:55483, base retention_local, 1121 filas sintéticas. Guardia sin aprobación rechazada; ROLLBACK por defecto conserva todo; RLSanon niega lectura. Cuatro commits de 250 eliminaron1000; quedaron 121, incluyendo 71 preservadas y 50 todavía elegibles. Conservó activas, boundary igual al corte, renovadas, actualizadas después del corte, endpoint/demand/unknown y renovación concurrente bajo lock.19–30 ms por lote locales no predicen Supabase.

El script [fixture-test.mjs](fixture-test.mjs) sólo creó tabla/índices/RLS sintéticos en la nueva instancia; no repitió benchmarks ni usó el cluster anterior. PostgreSQL propio se detuvo con pg_ctl y el puerto 55483 quedó sin listener. El hijo de renovación terminó. `node --check` aprobado. Datos/logs locales se conservan para auditoría, sin servicio en fondo.

Archivos cambiados: únicamente `tmp/retencion-2026-10-07/`. Sin src, migraciones, workflows, reportes versionados, dirección, git add/commit/switch. Siguiente acción: coordinación revisa y presenta el piloto para autorización de Jonathan, mientras define la recuperación de espacio total y la retención. Coste cero sigue vigente; publicar código no autoriza borrar datos.

## Revisión de coordinación

La propuesta pasó revisión independiente de `comparador_reviewer`: no encontró un fallo material. Se conserva el límite total procedimental, la ausencia de restauración demostrada y el alcance sintético de la prueba. El contador `active_or_boundary` de preflight se refiere a toda la tabla y al corte fijo; no representa actividad actual exclusiva del piloto.

Estos archivos están separados del release `99d5917`, publicado sin limpieza ni índices nuevos. Son una propuesta pendiente de autorización específica; el SQL mutante no se ejecutó en Supabase. La prueba conservada corrió desde `tmp/retencion-2026-10-07/` y el script usa esas rutas relativas y la instancia local propia indicada. Para repetirla se debe preparar una instancia sintética nueva y esas rutas; no es un script operativo para producción. El cluster usado ya está detenido.
