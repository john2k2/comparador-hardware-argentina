# Actualización local de publicaciones repetidas

`refresh-grouped-local.ts` recibe una lista explícita de hasta 25 ofertas conocidas y dependencias de proyección/estimación. No descubre productos ni publica datos. FullH4rd se excluye incluso si se suministra un ID suyo.

Encolar primero con `enqueueKnownProducts` y una ventana explícita; ejecutar `runGroupedLocalRefresh`. El consumidor reclama todos los leases antes del primer HTTP y agrupa por tienda, referencia de publicación y categoría. Cada oferta conserva su validación independiente. Una fuente anterior al lease, otra variante, fecha regresiva o cambio de destino no renueva precio ni stock. Persistencia, ACK y presupuesto ocurren en la transacción existente.

Si se operan la base completa y la muestra, abrir ambas copias y suministrar `pausePeers: [otherDatabase]`. Las dos deben tener `initializeRefreshDemand` aplicado. `shareRefreshPauses` comparte sólo las pausas activas 403/429 y conserva el máximo hasta 24 horas: antes de reclamar, entre grupos y después de un error. Nunca copia ofertas ni frescura. La validación precede todas las escrituras; la copia no es atómica entre archivos, pero un error detiene HTTP y las pausas ya copiadas sólo se extienden.

El límite de ejecución es tres minutos y cada lectura tiene un timeout máximo de 25 segundos. La deduplicación es dentro de cada lote; una publicación que atraviese lotes puede volver a leerse. No llamar catálogo completo a un lote de 25 ni contar una oferta duplicada como otra publicación.

La lectura compartida recibe `observedAfter` igual al máximo de todas las reservas del lote, incluidas publicaciones distintas. CompraGamer revalida una caché anterior a ese mínimo y conserva la hora de la respuesta real. No usar la hora de cada llamada como mínimo: eso impediría compartir la fuente entre publicaciones del mismo lote. El consumidor individual conserva su propio mínimo.

Prueba: compilar `refresh-grouped-local.test.ts` con esbuild, plataforma Node, formato ESM y paquetes externos; ejecutar con Node 26. Resultado 8/8. `refresh-demand.test.mjs`: 20/20. Cubren leases anteriores al HTTP, fuente anterior/distinta, stock desconocido, 403 persistente y compartido, deadline, exclusión de FullH4rd, presupuesto y lease reemplazado.

Ensayo real: 99 ofertas intentadas, 35 observadas, 17 comparables, 70 solicitudes HTTP. Hay 24 publicaciones observadas y 9 comparables distintas. Dos reintentos 403 iniciales ocurrieron antes de incorporar las pausas compartidas; quedaron registrados y ambas copias ya conservan el mayor bloqueo.

Reversión: retirar consumidor agrupado y helper de pausas con sus tests y declaración. Conservar los recibos y copias previas; revertir código no revierte observaciones ya guardadas. Restaurar un catálogo exige la copia completa, incluidos bases, resúmenes, proyección y marcador. El bundle activo del ciclo sigue siendo el consumidor individual, con la nueva prueba RAM; el barrido agrupado de la base completa fue explícito y no quedó programado.
