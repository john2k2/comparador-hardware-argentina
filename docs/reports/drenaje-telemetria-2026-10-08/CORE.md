# Núcleo del drenaje puntual respaldado

Preparación **local**, sobre copia `codex/capacidad-costo-cero`, revisión base `ebd1b6982dbbe0cc067d1c9291847b961dc90fb9`. Encargo del coordinador: implementar únicamente el núcleo, sus pruebas y este documento. No hubo ejecución remota, lectura de secretos, cambio de cron/SQL, publicación ni mantenimiento físico desde este frente. No certifica la capacidad global ni autoriza retiros fuera de un plan concreto aprobado.

## API y presupuesto

`validateTelemetryBacklogPlan(plan)` (alias `validatePlan`) exige nueve campos exactos: `projectId`, `cutoff`, `now`, `approvalId`, `codeVersion`, `maxSelectedRows`, `maxStoredBytes`, `deadlineMs`, `maxWindows`. Proyecto fijo `zyiyziubpcpgoqlkcrie`; revisión SHA de 40 caracteres; aprobación explícita no vacía. Cutoff UTC canónico con microsegundos, al menos cinco minutos anterior al `now` recibido. El plan devuelto está congelado y no admite estado de reanudación.

Los máximos del núcleo puntual son techos técnicos: 343.000 seleccionados, 32 MiB reservados, seis horas y 343 ventanas. **No son una autorización para ejecutarlos**; la entrada debe aplicar los presupuestos del plan revisado. El alcance concreto se registra en un plan inmutable y un recibo separado de autorización; este documento no habilita producción.

`processTelemetryBacklog(callbacks, plan, clock?)` reutiliza `processTelemetryMaintenance` sin modificarlo. Cada ventana conserva hasta cuatro lotes de 250, 120 segundos, 5 MiB y 30 segundos reservados antes del intento mutante. Se reserva su presupuesto antes del gate externo; la selección final reduce el tamaño/lotes para no superar las filas restantes. No hay OFFSET ni aumento de corte durante el trabajo.

`selected` cuenta filas recibidas del selector, incluidas las que después resultan cambiadas o repetidas; el presupuesto no se basa en `removed`. `storedBytes` reserva los bytes completos antes de autorizar custodia, aunque una subida parcial falle. Por eso es una cota conservadora de bytes comprometidos, no una medida del incremento físico real de Storage. `retireAttemptedRows` indica filas cuyo callback de retiro llegó a invocarse; permite distinguir una barrera local fallida antes de la RPC de una respuesta perdida después del intento.

## Contrato de callbacks y journal

Callbacks obligatorios: `selectSnapshot`, `storeArchive`, `retireSnapshot`, `reconcileMetadata`, `preflightWindow`, `writeCheckpoint`.

- Los cuatro primeros conservan las interfaces del núcleo diario y sus guardas de red. El núcleo diario valida formatos, seis campos, elegibilidad, precisión numérica textual, hashes/readback, ACK y conciliación independiente.
- `preflightWindow(plan, totals)` debe devolver exactamente `true`. `totals` incorpora `window` y `reservation`; incluye los contadores acumulados. La entrada es responsable de verificar el proyecto, fuente, esquema, permisos, presupuesto de Storage y exclusión operativa con otros mantenimientos. Un lock local no es una lease remota ni una reserva transaccional.
- `storeArchive(archive)` debe guardar primero la copia privada local durable y después realizar la custodia remota exacta. El snapshot, gzip, selección y manifiesto recibidos conservan el formato del núcleo existente. El retorno debe contener `manifest`, `gzipBytes`, `selectionBytes` descargados; el núcleo diario los verifica antes de llegar a `retireSnapshot`.
- `writeCheckpoint(record)` sólo debe resolver después de persistir el registro durable. La entrada debe crear un journal privado nuevo/exclusivo y sincronizar archivo/directorio según su contrato; una carpeta previa o registro pendiente bloquea cualquier reanudación automática. Este módulo no implementa filesystem ni capacidad de red.

Cada registro contiene `version`, `sequence`, `stage`, `window`, `plan`, `totals` y los detalles de su etapa. Las barreras previas son `started`, `window-reserved`, `before-select`, `selected`, `before-archive`, `archive-returned` y `pending-mutation`. El último incluye hashes del archivo, corte y **snapshot privado exacto** antes de llamar retiro. `ack-observed` y `reconcile-observed` conservan observaciones privadas; sólo el posterior `window-result`, validado por el núcleo diario, atribuye retiros reconocidos y conciliados. Una observación no sustituye esas validaciones.

El journal contiene datos privados; no debe subir a artefactos públicos. `selected` agrega hashes incrementales de claves vistas. Un Set en memoria evita repetir claves entre ventanas; los checkpoints preservan esos hashes para auditoría, sin admitir un cursor de reanudación. El resumen devuelto conserva contadores, hashes y resúmenes de ventanas, sin snapshots, claves de eventos, payloads ni approval ID.

## Paradas y cierre

Fallos de IO, gate externo, repetición, presupuestos, tiempo, ACK/conciliación desconocidos y cualquier cambiado/ausente detienen la operación completa. No se intenta otro lote/ventana tras esos casos. Los errores privados se sustituyen por códigos; un fallo al guardar el registro de parada mantiene `checkpointFailed` y no habilita recuperación automática. El snapshot previo sigue siendo la referencia para una conciliación de lectura independiente.

Los checkpoints consumen el plazo de la ventana: se comprueba tiempo global y local después de las barreras y antes de llegar a la capacidad de red. Un checkpoint lento de `pending-mutation` impide la RPC aun cuando resten horas del presupuesto global. No garantiza cancelación de una RPC ya iniciada ni de un transporte que no respete las señales; la entrada conserva sus timeouts y el resultado incierto se concilia.

Un lote corto/vacío exitoso sólo devuelve `awaitingIndependentFinalCheck: true`; `globallyComplete` y `physicalSavingProven` permanecen falsos. Alcanzar el presupuesto o número máximo de ventanas produce parada, no prueba que se vació el atraso. La entrada/coordinador debe contar independientemente lo elegible al corte y verificar supervivientes, respaldos y efectos físicos antes de cerrar la operación.

## Verificación y límites

Suite propia: `node --test scripts/lib/telemetry-backlog-drain.test.mjs`, **13/13**. Combinada con las cuatro suites existentes de mantenimiento, transporte, CLI y workflow: **61/61**, cero fallos/skips. ESLint de los dos archivos y `node --check` del núcleo aprobados. Los casos sintéticos cubren validación de plan, dos ventanas, checkpoints anteriores/posteriores al intento, ACK perdido, cambios/ausencias, repetición global, presupuesto acumulado de filas/bytes, subida parcial, lote corto, límite de ventanas, gate externo y plazos global/local. Los callbacks son fixtures sin red ni filesystem real; los fallos de IO se inyectan, no acreditan fsync real ni exclusión distribuida.

La revisión del coordinador debe verificar la entrada, su journal local durable, capacidad/prefight remoto, lock/exclusión y aprobación ligada al plan. No se cambian las RPC instaladas ni el mantenimiento diario. Publicación, operación remota, archivo de historia y compactación conservan sus encargos y verificaciones independientes.
