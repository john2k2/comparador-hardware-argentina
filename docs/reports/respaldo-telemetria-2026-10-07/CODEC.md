# Respaldo acotado de telemetría — codec local, 07/10/2026

Estado: funciones puras de Node implementadas y probadas. No hay red, IO de archivos, secretos, clientes, escrituras DB ni borrado de originales. La integración con el transporte, Storage y restauración PostgreSQL pertenece al coordinador.

## Contrato

`parseTelemetryCsv(csv)` admite header exacto y ordenado `cache_key,scope,payload,expires_at,created_at,updated_at`, seguido de 1–250 filas. Preserva comillas escapadas, comas, CR/LF internos y distingue celda vacía sin comillas (SQL NULL) de celda vacía entre comillas (texto vacío). Las seis columnas son obligatorias y NOT NULL. El input CSV tiene un límite separado de 8 MiB para tolerar quoting; el archivo descomprimido conserva el máximo de 4 MiB.

`buildTelemetryBackup(rows, { projectId, cutoff, selectionSha256, selection })` devuelve `{ manifest, gzipBytes }`. El gzip contiene NDJSON UTF-8, una fila por línea, con newline final. `selection` es la lista completa del preflight, con exactamente cuatro campos por fila: `cache_key`, `scope`, `expires_at`, `updated_at`. `selectionSha256` es el SHA-256 del recibo externo calculado por el coordinador; el codec lo trata como ancla externa y agrega `anchorsSha256` calculado sobre las anclas canónicas ordenadas.

`verifyTelemetryBackup(manifest, gzipBytes, expected)` es síncrono y devuelve las seis columnas de cada fila únicamente después de verificar todo. `expected` exige los mismos cuatro campos de configuración, obtenidos del preflight confiable. No se acepta el manifiesto como fuente de sus propias anclas. Todos los esquemas de configuración, selección, filas y manifiesto son cerrados.

Sólo se admiten `operational-endpoint-event` y `operational-store-event`. El conjunto de claves debe coincidir exactamente con la selección, sin duplicados, faltantes ni extras. Cada scope y las fechas de expiración/actualización deben coincidir tras normalización UTC; las anclas exigen expiración anterior al corte y actualización hasta el corte. Las tres fechas de cada fila se validan como calendario y se representan con seis decimales UTC sin pasar por `Date`. Se admiten entradas UTC `Z`, `+00`, `+00:00`, separador T/espacio y hasta seis decimales.

## Integridad y límites

`payload` permanece texto JSON íntegro: la validación usa `JSON.parse` sólo para sintaxis y descarta su resultado; nunca serializa ese resultado ni usa sus números. El NDJSON serializa el texto como una cadena escapada. JSON `null`, null internos, strings vacíos JSON, números grandes, whitespace y escapes sobreviven; SQL NULL y texto vacío sin JSON válido fallan. Los errores no incluyen fragmentos del payload.

El manifiesto v1 incluye schema `public.api_cache_entries.v1`, proyecto, corte, hashes de selección y anclas, conteo, scopes presentes, límites fijos, bytes y SHA-256 de gzip/NDJSON. Límite: 250 filas, 1 MiB gzip y 4 MiB descomprimido. `gunzipSync` aplica `maxOutputLength`; datos corruptos, gzip truncado, framing inválido, orden no canónico y contenido con anclas alteradas fallan sin resultado parcial. Filas y anclas se ordenan por clave; mismo Node/zlib y mismos valores producen el mismo gzip.

Los hashes detectan corrupción respecto del manifiesto confiable; no son firmas. El preflight contiene metadatos, no hashes de payload: una escritura que cambie payload o created_at sin cambiar las cuatro anclas no puede detectarse contra ese preflight. El coordinador debe contrastar los seis campos exportados y recuperados contra su CSV original, usando JSONB y microsegundos en PostgreSQL aislado. La normalización temporal conserva el instante exacto, no la sintaxis original del timestamp.

## Evidencia y cierre de esta unidad

`node --test scripts/lib/telemetry-backup.test.mjs`: 12 pruebas aprobadas. Cubren CSV, números JSON grandes, null/escapes/whitespace, microsegundos, determinismo, scopes, esquemas, selección exacta, renovación, faltantes/extras/duplicados, proyecto/recibo/corte, corrupción/truncado, framing y orden alterados, 250 filas, límites y bomba gzip. No se probaron aquí lecturas reales, descarga Storage ni restauración PostgreSQL.

Archivos propios: `scripts/lib/telemetry-backup.mjs`, `scripts/lib/telemetry-backup.test.mjs` y este documento. Rollback local: retirar únicamente estos tres archivos nuevos, preservando cambios del coordinador. No hay estado remoto que revertir. Próximo paso: integrar wrapper de lectura y demostrar comparación/restauración completa; el codec no autoriza retirar originales ni demuestra espacio DB recuperado.
