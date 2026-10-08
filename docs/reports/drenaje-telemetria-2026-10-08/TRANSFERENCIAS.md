# Transferencias paralelas verificadas del drenaje puntual

Candidata aislada en `scripts/lib/telemetry-backlog-storage.mjs`. El primer drenaje en marcha sigue ejecutando el helper anterior; no se reemplaza código cargado a mitad de una operación. Su integración posterior requiere nuevo plan, hashes y conciliación explícita de la operación anterior.

El helper existente de mantenimiento hace trece llamadas Storage por lote: tres POST y diez GET, incluyendo varias lecturas repetidas de bucket y los mismos objetos. La candidata hace ocho: dos consultas de bucket, tres POST inmutables y tres GET exactos. Esto reduce cinco viajes sin omitir objetos ni verificación.

## Barreras que conserva

1. Verificar localmente respaldo, prefijo, hashes, selección gzip y topes de un MiB por objeto.
2. Comprobar bucket privado y su contrato. Lanzar tres subidas independientes, con `upsert:false`, y esperar todas mediante `allSettled`.
3. Comprobar nuevamente el bucket. Lanzar tres descargas independientes y esperar todas; exigir igualdad de cada byte, tamaños, hashes y recuperación del respaldo.
4. Devolver los tres objetos descargados al núcleo, que vuelve a validar antes de entrar en la barrera durable y en la única RPC de retiro.

Un ACK de subida perdido se concilia mediante objetos exactos, sin volver a subir. Un objeto ausente, corrupto, rechazo, timeout o cambio de bucket bloquea el retiro. Los callbacks async también convierten un throw síncrono en un rechazo esperado; no se dejan subidas pendientes al retornar.

El formato y las tres rutas de objetos permanecen iguales. El lector de recuperación actual conserva compatibilidad; no se cambia la RPC, precisión de payload textual, selección ni diarios. La guard de red limita las capacidades y rechaza POST repetido, DELETE, rutas ajenas y upsert.

La candidata de metadatos lanza hasta cinco GET independientes de cincuenta claves, correspondientes al mismo ACK. Espera todas y comprueba pertenencia/tamaño de página. El núcleo conserva después esquema exacto de cuatro campos, unicidad y ausencia de las claves reconocidas.

## Validación

Cuatro pruebas pasadas: barrera de subidas y readbacks pendientes antes de retiro, ACK perdido, custodia parcial/corrupta/bucket público, SDK real con ocho llamadas y recuperación desde hash, y páginas de metadatos acotadas. Fixtures sin red. Revisión independiente Sol encontró cero materiales abiertos; también probó throw síncrono y señal abortada antes/después de subidas.

La integración debe conservar `transport:send/getSignal` de IO para el plazo global y de ventana. Esta función recibe capacidades ya acotadas, no construye una señal autónoma. Se mantienen 4×250, 120 segundos y treinta segundos previos a retiro.

La concurrencia puede modificar latencia y respuestas 429. El número de llamadas se acredita por fixture; el throughput productivo de esta candidata sigue pendiente. Las comprobaciones de bucket no constituyen una lease ni una reserva atómica.
