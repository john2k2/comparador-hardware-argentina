# Respaldo privado e inmutable de telemetría

La continuación autorizada prepara y verifica el respaldo del lote; el retiro de originales se revisa por separado. Usa el bucket existente `catalog-history-archive`, privado, con máximo 1 MiB por objeto y MIME gzip/JSON. No crea ni cambia buckets, políticas, cuentas o planes.

Dos objetos bajo `telemetry/v1/<SHA256-del-manifiesto>/`: primero `telemetry.json.gz`, último `manifest.json`. Los POST usan `upsert:false`; la descarga posterior debe coincidir byte por byte. Una respuesta de escritura perdida sólo se concilia si se recuperan bytes exactos. El helper puede reutilizar objetos ya idénticos sin reemplazarlos.

El transporte permite GET al bucket y a esos dos objetos; únicamente el comando upload habilita POST inmutable para esas mismas rutas. Rechaza otras rutas, orígenes, métodos, upsert y redirects. El timeout es 15 s por solicitud. Source usa otro transporte GET-only a api_cache_entries.

La recuperación necesita un manifiesto custodiado y la selección externa; no requiere el gzip local. Compara el manifiesto remoto contra el ancla y verifica esquema, selección, hashes y presupuesto antes de entregar filas. El SDK crea un Blob antes de nuestro control de tamaño: el límite del bucket protege objetos, pero no es una prueba de transferencia acotada antes de materializar la respuesta.

Prueba enfocada: `node --test scripts/lib/telemetry-backup-storage.test.mjs`, 4/4. Casos: repetición, respuesta perdida, corrupción, bucket público, presupuestos y capacidades de red. Runtime: dos objetos nuevos, 11.352 B, ambos descargados y verificados. Acceso público y anónimo: HTTP 400 para ambos; RLS activo, cero políticas. [Acceso de Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control).

El contenedor pasó de 19 objetos/90.664 B a 21/102.016 B. Esta entrega está muy por debajo del presupuesto manual previo de 5 MiB, sin reservar la cuota para futuras funciones. No hay proceso automático que siga subiendo lotes.

Revertir este adaptador y su test deshabilita la copia local; los objetos remotos y originales siguen disponibles. No borrar el prefijo remoto como rollback. Una eliminación futura de archivos necesita su propio inventario y decisión.
