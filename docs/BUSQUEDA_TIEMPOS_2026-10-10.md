# Medición de la demora inicial de búsqueda

La primera lectura amplia sigue bajo investigación. Esta unidad agrega diagnóstico al lector paginado y al header público `Server-Timing`; no constituye una optimización ni un cierre de rendimiento.

## Interpretación

`database` mide la espera del consumidor. `catalog_rpc` mide la llamada completa del SDK; `catalog_headers` mide fetch hasta recibir Response y agrupa conexión, servicio y SQL. `catalog_body` mide text y decodificación, excluyendo JSON.parse. `catalog_transform` mide validación, conversión y guards del catálogo. La creación del cliente aislado queda dentro de database y fuera de catalog_rpc.

Los contadores `catalog_calls`, `catalog_reads`, `catalog_rereads` y `catalog_coalesced` usan desc numérico, no duración. Los consumidores coalescidos comparten el diagnóstico del productor: sumar catalog_calls de varias respuestas duplicaría el trabajo compartido. Los nombres son fijos; no exponen consultas, URLs, errores ni credenciales.

## Unidad de cambio y validación

Un único cambio agrega cliente de lectura aislado, captura de tiempos y propagación por coalescencia. Conserva el cliente habitual, el cliente de servicio, las reglas de frescura/stock/identidad, la paginación, la escritura observable de caché y los errores 503/429. Tests con el SDK instalado verifican transporte y Response, errores, callbacks fallidos y consumidores compartidos. La revisión independiente local no identificó fallos materiales.

La verificación local de aplicación y scripts pasó; hay un warning de lint previo ajeno a esta unidad. La publicación y los resultados de producción deben registrarse por separado. El criterio de cierre es medir consultas públicas sin respuesta en caché después de la corrección, conservando resultados y filtros. Una respuesta en caché o un test verde no acredita ese criterio.
