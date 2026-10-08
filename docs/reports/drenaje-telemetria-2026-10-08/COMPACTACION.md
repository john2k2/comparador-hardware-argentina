# Compactación física serial después del drenaje

Estado: propuesta local y laboratorio; **no se ejecutó VACUUM remoto** ni se cambiaron datos, DDL, settings, credenciales o refresh. Proyecto `zyiyziubpcpgoqlkcrie`. El coordinador decide aplicación cuando cierre el drenaje y su reconciliación independiente.

El comando propuesto es válido en PG17, pero su ejecución mediante el conector actual **no está demostrada fuera de una transacción**. `SKIP_LOCKED` tampoco garantiza ausencia de bloqueos ni compactación: puede saltar la tabla y devolver éxito. La operación sólo debe avanzar por tabla con medición posterior.

Lectura agregada propia **2026-10-08 21:07:28.348707 UTC**: PostgreSQL 17.6, `statement_timeout=2min`, `lock_timeout=0`, `maintenance_work_mem=32MB`, `transaction_read_only=off`, `default_transaction_read_only=off`; las cinco tablas son ordinarias (`relkind=r`), el rol es propietario y tiene MAINTAIN en todas; locks de esas relaciones = 0. El cero es un corte, no una reserva del próximo instante.

El coordinador informó evidencia Chrome de **20:49–20:56 UTC**: disco asignado 8 GB y uso 1,29 GB. Su lectura SQL de **20:58 UTC** verificó la configuración y locks=0. No reabrí ni operé esa pantalla. Esto indica margen aparente para una tabla, pero no reserva espacio futuro ni prueba el límite de cuota lógico.

## Capacidad real del canal

El tool instalado acepta sólo `{project_id, query}`; no ofrece control de autocommit, sesión, timeout o transacción. El [código oficial de executeSql](https://github.com/supabase/mcp/blob/main/packages/mcp-server-supabase/src/platform/api-platform.ts#L192) envía `query`, `parameters` y `read_only` a `/v1/projects/{ref}/database/query`; no fija autocommit. La [API pública](https://supabase.com/docs/reference/api/v1-run-a-query) tampoco promete ese comportamiento. El código público actual no identifica la versión desplegada del conector.

Conclusión: está confirmado el acceso SELECT y el rol suficiente; **no** que VACUUM sea aceptado top-level. `transaction_read_only=off` sólo indica modo lectura/escritura, no ausencia de bloque transaccional. Un SELECT no demuestra la capacidad requerida. No hice una prueba VACUUM remota ni inventé conexión directa.

Cuando esté autorizada la operación concreta, enviar **sólo este statement**, sin BEGIN, COMMIT, SET, SELECT previo en el mismo mensaje, DO, función/RPC o migración:

```sql
VACUUM (FULL, ANALYZE, SKIP_LOCKED TRUE) public.api_cache_entries;
```

Si devuelve SQLSTATE `25001` (active_sql_transaction), detener ese canal. No intentar COMMIT/BEGIN internos para evadir el wrapper ni `apply_migration`. La alternativa mínima documentada es **SQL Editor del Dashboard**, ejecutando una sola sentencia de la tabla elegida; [Supabase documenta VACUUM FULL desde SQL Editor](https://supabase.com/docs/guides/platform/database-size#vacuum-operations). Su aceptación y configuración efectiva todavía requieren verificar runtime en la operación autorizada. No se requiere comprar; no consta una conexión remota psql configurada.

Una solicitud con varios statements puede crear un bloque implícito aunque no contenga BEGIN: el [protocolo simple de PostgreSQL](https://www.postgresql.org/docs/17/protocol-flow.html#PROTOCOL-FLOW-MULTI-STATEMENT) agrupa el mensaje. Separar llamadas no acredita continuidad de sesión para SET. El laboratorio reproduce el error con `SELECT 1; VACUUM ...`.

## Bloqueos, espacio y tiempo

`SKIP_LOCKED` evita esperar el lock inicial de la relación; al abrir índices puede bloquear, y ANALYZE tiene excepciones con particiones/herencia/foreign tables. El comando exige ejecución fuera de un bloque transaccional. Ver [VACUUM PG17](https://www.postgresql.org/docs/17/sql-vacuum.html). El caso actual son cinco tablas ordinarias; la excepción de índices sigue importando.

FULL reescribe heap y reconstruye índices, conservando la copia antigua hasta completar. Necesita espacio temporal y puede generar presión de I/O/WAL; no es una operación liviana ni autovacuum la realiza. El margen inicial debe cubrir copia nueva de tabla+índices, archivos temporales, WAL y crecimiento concurrente, con medición actual del disco. Ver [recuperación de espacio](https://www.postgresql.org/docs/17/routine-vacuuming.html#VACUUM-FOR-SPACE-RECOVERY). La reserva no se calcula multiplicando 32 MB: maintenance_work_mem limita memoria de trabajo, no tamaño de tablas, disco ni duración.

FULL toma ACCESS EXCLUSIVE y bloquea SELECT/INSERT/UPDATE/DELETE de la tabla mientras trabaja; puede haber esperas nuevas aunque el lock inicial haya sido inmediato. Ver [modos de lock](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-TABLES). Por eso hace falta una ventana operativa; SKIP_LOCKED no sustituye esa decisión.

`lock_timeout=0` desactiva el timeout de espera de locks. `statement_timeout=2min` limita la sentencia del servidor, incluidas esperas, si ese valor sigue efectivo en el canal de ejecución. No asegura que el cliente reciba respuesta ni autoriza subir el límite. Con un timeout del cliente, el estado servidor es desconocido hasta consultar progreso/actividad. Ver [timeouts PG17](https://www.postgresql.org/docs/17/runtime-config-client.html).

## Secuencia y criterios de parada

1. Cerrar todas las unidades de drenaje, recibos/checkpoints y reconciliación final; verificar respaldo global/readback/custodia y recuperar localmente muestras. No usar un número de filas retiradas como cierre suficiente.
2. Medir antes: `pg_database_size`, tabla/TOAST/índices/total de las cinco tablas, `pg_relation_filenode` de la tabla elegida, índices válidos/listos, constraints, filas vivas/remanentes y snapshot de funcionamiento representativo. Registrar hora/canal/configuración; confirmar espacio libre y ausencia de mantenimiento/drenaje simultáneo o transacciones antiguas relevantes.
3. Ejecutar sólo api_cache_entries, una llamada y una tabla. Observar desde otra lectura `pg_stat_progress_cluster` (FULL), `pg_stat_progress_analyze`, locks y espera; no lanzar una segunda compactación ni cancelar procesos ajenos.
4. Tras respuesta o pérdida de respuesta, reconciliar estado antes de reintentar: presencia de backend de mantenimiento, cambio de relfilenode, tamaños, índices, filas y recibo de salida/error. Un retorno vacío/HTTP 200 o que termine rápido no prueba rewrite; un salto por lock es resultado no aplicado.
5. Si hubo `57014`/timeout, `25001`, skip, permiso insuficiente, error de espacio (`53100`), caída de disponibilidad o resultado desconocido: detener la secuencia. Resolver el motivo con evidencia; no repetir de inmediato ni ampliar timeout/settings por cuenta del agente.
6. Si terminó y las invariantes/lecturas siguen correctas, medir tamaño lógico actual y contrastar el panel cuando se actualice. Si el exceso cesó, parar. Si persiste, seleccionar **una** de las otras tablas sólo cuando haya evidencia de espacio recuperable y costo de bloqueo/timeout aceptable; repetir pre/post.

Lista acotada de posibles siguientes tablas (no lote automático): `products`, `price_history`, `catalog_price_summaries`, `product_prices`. Sus totales iniciales en [INDICES.md](INDICES.md) son 238.444.544 / 178.446.336 / 119.398.400 / 103.481.344 B. Elegir por beneficio esperado tras medir bloat y actividad, no por tamaño o `idx_scan=0` solamente. Los datos de historia y lectores 7/90/365 siguen conservados.

Cada siguiente operación reemplaza únicamente el nombre de tabla en el comando, permanece individual y requiere el gate anterior. No ejecutar VACUUM sin tabla ni las cinco sentencias juntas. Las tablas no drenadas pueden tener poco espacio recuperable: la presión de cuota no prueba bloat.

El progreso de FULL está en [pg_stat_progress_cluster](https://www.postgresql.org/docs/17/progress-reporting.html), no pg_stat_progress_vacuum. Sus fases muestran trabajo y reconstrucción de índices; no dan una ETA fiable. Las consultas de observación deben ser agregadas, sin payloads ni secretos.

## Preservación y recuperación

VACUUM FULL no es una eliminación lógica ni restaura lo retirado por el drenaje. Después comprobar PK/UNIQUE/FK/checks, índices válidos/listos, filas remanentes, lecturas de cache y contratos del catálogo/historia. El backup de telemetría no respalda las otras cuatro tablas; las ocho muestras prueban la recuperación de esa muestra, no de toda la base.

Ante un error SQL confirmado, verificar primero el rollback y la liberación de locks. El laboratorio muestra que un timeout durante reconstrucción mantuvo el archivo original y los datos; no convierte toda caída de conexión en rollback confirmado. Si la respuesta se pierde, observar/reconciliar; no restaurar ni reinsertar archivos por reflejo.

Un cambio lógico comprobado requeriría investigación y recuperación específica autorizada desde respaldo válido, preservando filas nuevas/cambiadas. Sin esa evidencia, restaurar podría reintroducir eventos vencidos o sobrescribir actividad legítima. No hay una reversión por COMMIT/ROLLBACK después de una compactación ya completada; su forma física previa no necesita restaurarse.

El disco asignado no baja automáticamente por compactar. La métrica del panel puede actualizarse diariamente y difiere de datos/índices vs disco/WAL/sistema; [Supabase distingue ambas medidas](https://supabase.com/docs/guides/platform/database-size). No llamar recuperada la cuota de 500 MB por bajar una relación o por disponer de disco; exigir la medida lógica relevante y estado real del servicio.

## Laboratorio propio, sin TCP ni producción

PG **17.11 Homebrew**, socket privado en `/private/tmp/ch-vf-ldzqscjx`, carpeta 0700; `listen_addresses=''`, nombre `compactacion-lab`; cluster detenido al finalizar. Sólo datos sintéticos; sin credenciales/env del proyecto. Ejecutado el 08/10/2026. Recibo privado `receipt.json` SHA-256 `8f53c94c107236905a12140be87e37556f7ca648aebad281bf1184aff65256b0`.

| Caso | Resultado local |
|---|---|
| BEGIN + comando / dos statements en un mensaje | Ambos rechazados `25001`. |
| Otra sesión sostiene ACCESS SHARE; SKIP_LOCKED | Retorno 0 en 9 ms; tabla omitida y relfilenode sin cambio. |
| Una sentencia FULL+ANALYZE; 2 min / 0 / 32 MB | 23 ms; total 9.125.888 → 942.080 B; 2.000 filas y digest exacto preservados; relfilenode cambió; índices válidos/listos. |
| Timeout 50 ms inducido durante índice de expresión lento | `57014`; relfilenode, tamaño, 2.000 filas, digest e índices originales preservados. |

Límites: lab menor y PG17.11 frente a remoto17.6; no predice duración/WAL/espacio de producción ni prueba el wrapper MCP o el bloqueo al abrir índices. No se ensayó pérdida de red. Se verificó sintaxis, saltos por lock, transacciones y rollback de un timeout local; no recuperación remota de cuota.

Recomendación al coordinador: cerrar el drenaje, capturar corte posterior y preparar una única ejecución revisable para api_cache_entries. El bloqueo pendiente es el canal top-level: usar sólo la sentencia aislada en el canal autorizado; si MCP envuelve transacción, pasar a SQL Editor, con los mismos gates y medición. No ampliar a otras tablas por un bucle automático.
