# Recuperación local de las ocho muestras nuevas

**Ensayo local aprobado: ocho muestras, 2.000 filas; restauración exacta de los seis campos y preservación de existentes modificados.** Inicio `2026-10-08T20:32:22.637Z`, cierre de verificaciones `2026-10-08T20:32:24.643Z`; PostgreSQL **17.11 Homebrew**. El clúster propio quedó detenido antes de escribir el recibo durable. No hubo conexión remota, lectura de env/credenciales, retiro productivo, subida de Storage, migración ni mantenimiento físico desde este frente.

Encargo del coordinador: escribir únicamente `scripts/pilots/telemetry-backlog-restore.mjs` y este informe, ejecutando sobre la preparación privada entregada. Copia managed `codex/capacidad-costo-cero`, base `ebd1b6982dbbe0cc067d1c9291847b961dc90fb9`; se preservaron los cambios de otros frentes en núcleo/IO/CLI. La muestra y sus CSV fueron capturados por el coordinador; este piloto sólo los leyó localmente.

## Fuentes y comando reproducible

Preparación privada: `tmp/drenaje-telemetria-2026-10-08/preparacion-completa/sample.json`; SHA-256 **`cba6c666ac244f1cdd48f8dc8deb46b766e583d1437225e98990bb70faddd5ca`**. Cada entrada identifica una carpeta por `manifestSha256`, con `source.csv`, manifiesto, gzip de telemetría, gzip de selección y snapshot privado. Se comprobaron hash de carpeta/manifiesto, hash de selección descomprimida, proyecto/corte, codec e integridad del respaldo, snapshot exacto, cantidad/scope de filas y bytes almacenados. Cada `source.csv` conservó el tamaño y SHA-256 registrado en `sample.json`; no se reutilizó el hash del piloto anterior.

Comando ejecutado:

```sh
node scripts/pilots/telemetry-backlog-restore.mjs \
  tmp/drenaje-telemetria-2026-10-08/preparacion-completa \
  restore-local-20261008.json
```

El recibo agregado privado está en `tmp/drenaje-telemetria-2026-10-08/preparacion-completa/restore-local-20261008.json`. El nombre de salida debe ser nuevo y exclusivo; una repetición con el mismo nombre se rechaza. El stdout contiene sólo resultado agregado y no imprime filas, payloads, claves o logs.

## Aislamiento y referencia independiente

Se creó un clúster nuevo en `/private/tmp/ch-br-HtivCZ`, directorio y socket privados `0700`, sin TCP. Antes de las operaciones se comprobaron `data_directory`, `cluster_name`, `listen_addresses=''` y versión mayor 17. Los subprocesos reciben únicamente PATH/locale controlados, sin entorno del proyecto. SQL y CSV entran por stdin a `psql`; no hay host configurable ni credenciales. El piloto sólo puede detener su propio clúster.

Los primeros dos intentos fallaron al arrancar PG bajo la ruta temporal larga de macOS; no llegaron a crear la base de ensayo ni a comparar/restaurar muestras. Se cambió a un directorio privado corto en `/private/tmp` para el socket UNIX y la ejecución completó. El código comprueba el estado del clúster propio ante un inicio incierto y detiene únicamente ese clúster si llegó a iniciar. No se imprimieron logs de esos intentos.

La referencia de cada muestra se importó directamente desde `source.csv` con **COPY FROM STDIN**, sin reconstruirla desde el respaldo en JavaScript. La otra rama recuperó filas mediante `decodeTelemetrySelection` y `verifyTelemetryBackup`, conservando el payload numérico como texto; no se convierte a float. La restauración usa el SQL local generado por `prepareBackedTelemetryRetention`, nunca una operación remota.

Una diferencia bidireccional `EXCEPT ALL` comparó `cache_key`, `scope`, `payload` JSONB, `expires_at`, `created_at` y `updated_at` contra la referencia COPY. Esto valida valores PostgreSQL, incluidas precisión numérica y microsegundos; no compara sólo conteos, hashes de archivos o serializaciones externas de JSON.

## Resultado por muestra

| Scope | Offset de captura | Filas | Diferencias de seis campos tras recuperar | Retiro / restauración local | Repetición retiro / restauración | Existente modificada y sentinelas |
|---|---:|---:|---:|---:|---:|---|
| Endpoint | 0 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |
| Endpoint | 4.549 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |
| Endpoint | 9.098 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |
| Endpoint | 13.647 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |
| Tienda | 0 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |
| Tienda | 109.615 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |
| Tienda | 219.230 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |
| Tienda | 328.846 | 250 | 0 | 250 / 250 | 0 / 0 | Preservados |

Para cada muestra, preview sin mutación y CAS de seis campos reconocieron las 250 filas. DELETE dejó sólo tres sentinelas de caché; el retiro repetido borró cero. La restauración recuperó las 250 originales exactamente y su repetición insertó cero, conservando existentes.

Luego se modificaron **sólo en el laboratorio** payload y un microsegundo de actualización de una fila. El CAS retiró las otras 249 y conservó esa diferencia; restaurar insertó las 249 ausentes sin reemplazar la existente. Se comparó el resultado final contra las 249 referencias originales más la fila local modificada, con cero diferencias. El estado final de esta prueba conserva deliberadamente esa modificación: la restauración exacta de las 250 originales se comprobó en el paso anterior.

Se preservaron, por comparación de contenido, tres sentinelas de caché —activos y otro scope vencido— y los sentinelas separados de usuarios, precios e historial. Son fixtures locales; no representan una auditoría de esas tablas productivas. Los ocho tiempos por muestra quedaron entre 178,40 y 191,56 ms, incluyendo cliente; no son throughput remoto.

## Pruebas, límites y siguiente acción

Ejecución completa aprobada; comprobaciones de sintaxis y ESLint del piloto aprobadas. El recibo contiene ocho grupos por muestra mediante resultados agregados: identidad del origen/respaldo, preview, retiro exacto, retiro repetido, restauración exacta, restauración repetida, preservación CAS/restauración de modificación y sentinelas. No se extrapola este ensayo a la totalidad del atraso o a toda la base.

Esto demuestra recuperación **local** de esas 2.000 filas y el comportamiento de los helpers vigentes. No demuestra custodia remota de estas muestras, restauración productiva, cuota disponible, exclusión entre operadores, rendimiento remoto, ahorro físico ni autorización para retirar el atraso. No se ejecutó VACUUM/FULL.

Siguiente acción del coordinador: revisar piloto y hashes del recibo, incorporarlo a la custodia de la candidata y conservar el gate de operación concreta del drenaje. Una restauración remota seguirá necesitando encargo específico que preserve cambios posteriores; este laboratorio no la ejecuta ni la autoriza.
