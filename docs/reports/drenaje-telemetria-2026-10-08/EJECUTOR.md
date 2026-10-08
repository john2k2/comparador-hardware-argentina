# Ejecutor puntual y custodia

Operación única para eventos vencidos de `operational-endpoint-event` y `operational-store-event`. Conserva las RPC instaladas y el cron. No opera historial, usuarios ni precios actuales. `prepare` sólo lee y respalda localmente una muestra; `execute` requiere autorización ligada al SHA-256 de ese plan exacto.

## Preparación

El coordinador captura por MCP un preflight agregado: proyecto, instante observado, corte fijo, recuentos de ambos scopes, ocupación del bucket y definiciones de las dos funciones. Antes de activar comprueba ACL sólo postgres/service_role, security invoker, ausencia de triggers y FKs entrantes, bucket privado y tamaños conocidos. Estas lecturas independientes no son una lease ni una reserva transaccional.

La entrada fija proyecto/origen, exige preflight de hasta treinta minutos y hashes conocidos de las RPC. La captura CSV toma hasta cuatro páginas de 250 por scope, distribuidas por clave. Guarda CSV original, snapshot de seis campos, gzip, selección comprimida y manifiesto. El tamaño extrapolado es una estimación, no una garantía del archivo completo.

Los directorios son privados, del usuario local, dentro de `tmp/drenaje-telemetria-2026-10-08`. Los archivos se crean de forma exclusiva, con permisos 0600 y sincronización de archivo/directorio. Se rechazan rutas ajenas y symlinks observables; no constituye protección contra un atacante concurrente con la misma identidad local.

## Ejecución

El plan conserva SHA de revisión, hashes de ocho módulos, corte, presupuestos y aprobación. El recibo separado añade proyecto, operación, SHA exacto del archivo, approvalId y authorizedAt; debe aprobar explícitamente la mutación y vencer a treinta minutos. La autoridad procede de la decisión humana registrada por el coordinador, no de generar este JSON.

Antes de cada ventana se revisan ejecuciones queued/in_progress/waiting de GitHub y distancia al próximo diario nominal. Es un gate conservador: también puede detenerse por guías activas, y no excluye otro operador privilegiado fuera de GitHub. La comparación de seis campos protege filas cambiadas concurrentemente.

Hay un lock local exclusivo y un marcador irreversible de plan usado. Nunca se reanuda automáticamente ni se vuelve a usar el plan tras una interrupción. Un fallo entre crear el lock y registrar un plan ya usado puede dejar un bloqueo sin intento remoto; exige conciliación manual, no borrar el lock a ciegas.

Cada respaldo se sincroniza primero localmente. Después sube tres objetos inmutables al bucket privado, los descarga y verifica antes del único intento de retiro. El journal sincronizado conserva snapshot y hashes antes de esa RPC. ACK y metadata independiente deben conciliarse antes de atribuir una fila retirada.

Todas las peticiones Data/Storage reciben una señal efectiva del plazo de ventana de 120 segundos y global. También conservan quince segundos por petición. Un timeout mutante no prueba cancelación del servidor: se registra incertidumbre, se detiene y no se reintenta.

El lock sólo se quita después de un cierre sin incertidumbre, filas cambiadas ni fallo de journal y con cada intento conciliado. El resumen público muestra agregados. Respaldos, CSV, snapshots y journal permanecen privados.

## Cierre

Un selector corto sólo habilita comprobación externa: recuento independiente al mismo corte, conciliación de manifests y protección de otros scopes. No significa ahorro físico. PostgreSQL puede conservar espacio de filas retiradas para reutilizar; el mantenimiento físico requiere una medición y operación separadas.

Verificación local: suite nueva IO/CLI con filesystem real, exclusividad, permisos, symlinks, autorización exacta, fechas inválidas, scheduler y señales agotadas; suite del núcleo conserva pruebas de pérdida de ACK y barreras previas/posteriores. La recuperación de muestras reales se registra en `RECUPERACION.md`, y la operación concreta en el informe de cierre.
