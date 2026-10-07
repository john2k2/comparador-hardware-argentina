# RPC acotadas del runner

Preparación local, sin ejecutar la migración en Supabase. Selector de hasta 250 eventos vencidos de dos scopes; payload JSONB sale como texto para conservar números grandes. Fechas UTC con seis decimales. Cutoff finito y al menos cinco minutos anterior al reloj de la DB.

El selector comprueba el contenedor completo y reserva hasta tres objetos de 1 MiB antes de entregar el lote. Tope interno 50 MiB, fijo, incluye el piloto de historial; tamaños ausentes/ilegibles detienen el proceso. No elimina respaldos al llenarse ni representa el saldo global de cuenta. La concurrencia del workflow serializa sus runs; otras operaciones privilegiadas de Storage podrían cambiar uso entre selección y subida. No se promete reserva transaccional entre DB y Storage.

Retiro recibe únicamente ese snapshot, máximo 250/4 MiB, seis campos exactos, claves únicas, scopes y vencimientos válidos. Conserva cualquier diferencia en payload, creación, actualización, scope, clave o expiración. Adquiere lock de escritura compartible antes de comprobar triggers/relaciones entrantes: si existen, falla sin borrar. ACK devuelve las claves retiradas y contadores; el runner debe reconciliar y no reintentar tras perder respuesta.

Ambas funciones son SECURITY INVOKER, search_path pg_catalog y objetos de tabla calificados. EXECUTE revocado a PUBLIC/anon/authenticated; sólo service_role. No hay nuevos grants de tabla, políticas, índices ni privilegios al navegador. La RPC no prueba por sí misma la existencia del respaldo: esa barrera está en el runner, que sube y descarga antes de llamar. La credencial server conserva capacidad privilegiada preexistente y no sale del servidor de tareas.

Lock timeout 500 ms. El timeout HTTP del runner no garantiza cancelación del trabajo SQL cuando se pierde respuesta; la reconciliación trata ese caso como incierto. No se promete statement timeout de 3 s desde una función: PostgREST inicia su transacción antes de entrar. Se requieren los límites de consulta del servicio más límites de tamaño y selección. No ejecutar VACUUM desde el runner.

Runtime local: node scripts/pilots/telemetry-maintenance-sql.mjs tmp/retencion-automatica-2026-10-07/sql-local-reviewed.json. PG17.11 nuevo, socket UNIX privado sin TCP, RLS y rol server reales; siete grupos cubren precisión, retiro exacto/repetición, diferencias, inputs, efectos por esquema, permisos y presupuesto de archivos. Cierre 22:06:21 UTC, fixture revertida y cluster detenido. No acredita RPC publicada ni throughput remoto; producción usa PG17.6.

Supabase CLI 2.109.1, db advisors de seguridad/performance sobre ese mismo cluster aislado: salida 0 y “No issues found” a las 22:13:16 UTC; cluster detenido otra vez. El esquema de fixture es mínimo: no acredita revisión completa de Auth, Storage ni producción. Recibo privado advisors-local.json; no se usó proyecto enlazado ni se instaló SQL remotamente.

Rollback de esta unidad: retirar las dos funciones y revocar su ejecución, o revertir la migración antes de publicarla. No toca originales ni archivos respaldados. Dejar la integración en inspect evita su llamada. El SQL de rollback de funciones no restaura filas que una activación futura retire; esos eventos requieren recuperación específica desde archivos privados y autorización correspondiente.
