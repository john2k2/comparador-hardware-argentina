# Lote respaldado preparado para revisión

Sólo están preparados 250 eventos: 149 de operational-endpoint-event y 101 de operational-store-event. Se identifican por la selección custodiada y el manifiesto SHA-256 6558b3d3ccc94614e90a16264c835cd604a1f8afac18ef7791e50847e848a654. El respaldo completo y su restauración local están comprobados. El retiro remoto no está autorizado ni ejecutado.

`prepareBackedTelemetryRetention` verifica primero el respaldo y genera tres SQL sin cliente, env o conexión. El script `scripts/pilots/telemetry-retention-prepare.mjs` sólo guarda SQL y recibo privados, nunca aplica operaciones. Límite 250, statement_timeout 3 s, lock_timeout 500 ms.

El preview es READ ONLY. Apply compara clave, scope, payload JSONB, expires_at, created_at y updated_at, además de exigir los dos scopes y vencimiento/actualización antes del corte. Sólo puede retirar claves del snapshot respaldado; una ausencia o cualquier cambio se conserva como changed_or_missing. No vuelve a seleccionar un lote distinto ni incluye caché activa, demanda, usuarios, precios o historial.

Restore inserta los seis campos originales mediante `ON CONFLICT(cache_key) DO NOTHING`: conserva filas que ya existan. No renueva la fecha ni vuelve vigente un evento vencido. Payload permanece texto hasta el cast JSONB; dollar quoting con delimiter verificado evita depender del escape de strings de sesión.

La salida de SELECT con removed/restored keys ocurre antes de COMMIT. Una ejecución futura sólo se declara confirmada con finalización y ACK de COMMIT; pérdida de respuesta implica estado desconocido. No reintentar a ciegas: contrastar ese mismo lote antes de cualquier nueva operación. Se prepara recuperación como opción revisable, no como permiso automático para insertar remotamente.

Ensayo `scripts/pilots/telemetry-backup-restore.mjs`: cluster propio PG17.11 en loopback 55487, puerto libre obligatorio, directorio/cluster comprobados y apagado en finally. La referencia importa CSV original por COPY stdin, independiente del codec. Diez casos cubren igualdad de 250/seis campos, preview, retiro/recuperación local confirmados, repetición, renovaciones, rollback de error, payload/created_at cambiados y ausencias, numerics JSON/decimales/null/micros, strings de sesión off y sentinelas. Datos del ensayo locales; producción PG17.6 no se simula idéntica.

Preparación final privada: `tmp/respaldo-telemetria-2026-10-07/retirement-final-pending/`. Preview SHA 4e60051117d15388a1e8a7481c6b9bcc6ba25fc0a8ca031ac12e9dae94cf12f9; apply SHA 28e6aa1bf4ed207b225f7fefc5fffef5ed59db7e5e19e253d366a3706f9ae58e; restore SHA 91af6e981763bc55b27258301f310178c86e93978f09d9d8ae1da0889bbe4a65. El directorio retirement-pending anterior queda supersedido y no debe aplicarse.

Prueba enfocada: `node --test scripts/lib/telemetry-backed-retention.test.mjs`, 2/2. Revisión independiente comprobó los tres SQL finales byte por byte contra el generador y sus hashes. No hubo RPC mutante, DELETE/INSERT remoto, mantenimiento, índices, migración o publicación.

Rollback del preparador: retirar generador, test, script y harness; los originales y archivos remotos permanecen. Un lote aplicado requeriría la restauración específica ya ensayada, después de conocer su commit y recibir autorización. Borrar filas no prueba reducción física del archivo; la capacidad requiere una medida posterior propia.
