# Codec local de historial — 07/10/2026

Estado: implementado y probado localmente. No se publicaron archivos, no se crearon buckets y no se tocaron filas originales. Este módulo no tiene acceso a red, filesystem, secretos ni PostgreSQL. El adaptador de IO lo aporta el coordinador. Tamaño de esta unidad: 220 líneas de codec, 165 de pruebas y 51 de documentación (436 en total); supera el objetivo orientativo de 400 en 36 líneas para cubrir límites, selección y restauración sin quitar evidencia.

## Contrato

`buildHistoryArchive(rows, options)` devuelve `{ manifest, chunks }`. `chunks` es un `Map<string, Buffer>` que contiene gzip de NDJSON UTF-8 con una fila por línea y newline final.

Opciones obligatorias: `projectId`, `cutoff`, `snapshotAt`. Las dos fechas usan exactamente `YYYY-MM-DDTHH:mm:ss.ffffffZ`. `cutoff` es exclusivo: todas las observaciones archivadas deben ser anteriores. El codec valida el calendario sin pasar por `Date`, conservando los microsegundos.

Opciones de tamaño: `maxRowsPerChunk` (250 por defecto; máximo 1000), `maxCompressedBytes` (1 MiB por defecto y máximo), `maxRawBytes` (8 MiB por defecto y máximo). Hay un máximo global de 1000 filas de muestra. Una sola fila que exceda un límite falla; los límites se pueden reducir, nunca ampliar.

`verifyHistoryArchive(manifest, fetchChunk, expected = {})` es asíncrono y devuelve las filas canónicas completas únicamente al terminar todos los controles. `fetchChunk(name)` debe devolver un `Buffer`; cualquier ausencia, excepción o corrupción aborta la operación. El adaptador debe usar el nombre recibido dentro de su directorio o prefijo fijo; el codec valida ese nombre antes de llamar al adaptador.

`expected` acepta `projectId`, `cutoff`, `snapshotAt`. El integrador debe proporcionar los tres desde su configuración del piloto, no desde el mismo manifiesto descargado, para anclar la restauración al proyecto y al corte esperado.

`readHistoryArchiveSelection(manifest, fetchChunk, selection, expected = {})` filtra por `storeId`, `date` UTC (`YYYY-MM-DD`) y/o `productId`. Devuelve `{ rows, verification: 'selected-chunks', verifiedChunks, totalChunks }`. Descarga y valida íntegramente sólo los chunks candidatos. No afirma integridad global; incluso una selección sin resultados conserva ese estado parcial.

## Filas y manifiesto v1

Las ocho columnas del encargo son obligatorias y no se admiten extras:

| Columna | Representación canónica |
| --- | --- |
| `id` | UUID, minúsculas |
| `product_id`, `store_id` | texto no vacío |
| `price` | texto decimal no negativo de `NUMERIC(14,2)` |
| `original_price` | null o texto decimal firmado de `NUMERIC(14,2)` |
| `stock` | `in-stock`, `low-stock`, `out-of-stock`, `unknown` |
| `recorded_at` | UTC, seis decimales, calendario válido |
| `offer_url` | null o texto |

No se admiten precios JavaScript numéricos, exponentes, más de dos decimales ni más de doce dígitos enteros. `price` rechaza negativos; `original_price` los conserva porque el coordinador confirmó que esa columna no tiene el CHECK de no negatividad. Un texto como `8.1` se convierte sin pérdida en `8.10`; no se redondea. Un valor `unknown` se restaura como `unknown`: el archivo no infiere disponibilidad. IDs duplicados fallan antes de construir el archivo y durante la lectura.

El manifiesto tiene campos cerrados: `version: 1`, `schema: 'public.price_history.v1'`, `projectId`, `cutoff`, `snapshotAt`, `source`, `limits`, `rowCount`, `rowsSha256`, `chunks`. `source` declara explícitamente `{ kind: 'bounded-paginated-sample', consistency: 'non-transactional', maxRows: 1000 }`. No representa un backup global ni una extracción transaccional.

Cada descriptor incluye `name`, `storeId`, `date`, `rowCount`, `rawBytes`, `gzipBytes`, `rawSha256`, `gzipSha256`, `firstRecordedAt`, `lastRecordedAt`, `firstId`, `lastId`, `productIds`. Los IDs primero/último corresponden al orden cronológico con desempate por UUID; no son un mínimo/máximo lexicográfico de UUID. `productIds` es un índice único ordenado para elegir chunks.

Se agrupa por día UTC y tienda. Los nombres contienen fecha, SHA-256 completo del texto de tienda y contador de seis dígitos. No se usa el texto de tienda como ruta. Las filas se ordenan por `recorded_at` y después `id`, independientemente del orden de entrada. La compresión y la partición se repiten idénticas en el mismo runtime de Node/zlib y con las mismas opciones; una versión distinta de zlib podría comprimir distinto.

Se verifican bytes y SHA-256 del gzip y del NDJSON, framing, representación canónica, calendario, esquema, corte, conteos, orden, unicidad, agrupación e índice de productos. `gunzipSync` usa `maxOutputLength`; los límites se validan antes de IO y se clona el manifiesto para impedir que un callback los amplíe durante la lectura.

Los hashes detectan corrupción respecto de un manifiesto confiable. No son firmas: reemplazar tanto los datos como el manifiesto puede producir otro archivo coherente. La custodia del manifiesto y las autorizaciones de Storage pertenecen al integrador. La selección depende de ese índice confiable y no comprueba chunks omitidos.

## Evidencia y siguiente paso

Comando local: `node --test scripts/lib/history-archive.test.mjs`; doce pruebas aprobadas. Cubren precisión decimal y temporal, null, original_price firmado, determinismo, agrupación, límites por filas y bytes, muestra vacía y máxima de 1000 filas, calendario bisiesto, entradas inválidas, duplicados, missing/corrupt/truncated gzip, framing NDJSON, metadatos manipulados, aislamiento de proyecto/corte, bomba de descompresión y lectura selectiva.

La evidencia del esquema real y la extracción CSV paginada corresponden al coordinador; este codec recibe el contrato de ocho columnas y no consultó `information_schema`. No se probó una restauración en PostgreSQL ni la descarga desde Storage. No hay garantía de snapshot entre páginas ni de conservar filas fuera de la muestra.

El coordinador debe revisar esta unidad y probar exportación → codec → lectura completa → comparación de las ocho columnas. Después podrá preparar la integración local de Storage y una restauración aislada conforme al encargo. No hay función de borrado ni señal de autorización para retirar originales. Rollback local: retirar los tres archivos de esta unidad sin modificar otros cambios; no hay estado remoto que revertir.
