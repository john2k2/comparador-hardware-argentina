# Mantenimiento del reloj en el ciclo privado

El LaunchAgent de la Mac ejecuta `automatic-cycle.mjs` con la configuración y el cierre originales. El ciclo conserva la cohorte y los presupuestos. No descubre productos, no despliega el sitio y excluye FullH4rd.

Una proyección habilita caché sólo hasta su próxima transición real: cambio de relevancia o vencimiento de una oferta/resumen. No extender ese marcador por TTL. Sin observaciones nuevas, el ciclo anterior dejaba vencer la proyección y la búsqueda conservaba sus resultados correctos mediante el motor original, pero consumía más lecturas y deshabilitaba caché.

Cuando vence el marcador, el ciclo toma un tick exclusivo de mantenimiento. Reserva hasta 4.000 escrituras dentro del máximo diario configurado, reconstruye las transiciones vencidas con `affectedProductIds: []` y devuelve `maintained`, `sourcesDeferred` y métricas de proyección. Ese tick no consulta tiendas ni modifica precios, stock, fechas, productos, bases de ofertas o membresía. Las fuentes quedan pendientes para el siguiente tick; una proyección vigente conserva los lectores o el estado idle habitual.

La reconstrucción, estimación, validación del delta y cargo del ledger local están en una sola transacción. La validación compara el checkpoint con la misma conexión del writer antes de confirmar. Una estimación superior a la reserva, un delta de más de 200 proyecciones/128 KB o un presupuesto local agotado provocan rollback. No aumentar límites para superar un rechazo. La estimación SQLite no sustituye el recibo real D1.

El checkpoint y el outbox conservan el estado recuperable ante una respuesta perdida o un fallo entre el commit y el archivo. Recuperar no consulta de nuevo tiendas ni carga el ledger otra vez. Un consumo remoto desconocido mantiene su reserva conservadora hasta el final del día, como antes. Un error local de mantenimiento no marca la divergencia remota irreversible.

Se vuelve a comprobar el cierre autorizado antes de iniciar y confirmar el mantenimiento. Si la lectura de estado o el cálculo cruza el cierre, no se confirman marcador/proyección/ledger ni se crea una publicación remota pendiente.

## Límites de esta unidad

El marcador puede vencer entre ticks: hasta el mantenimiento siguiente, la API conserva el fallback correcto y su coste mayor. Si las transiciones ocurren continuamente antes del siguiente tick, pueden retrasar las fuentes; medir cobertura antes de ampliar el ensayo. Más de 200 proyecciones vencidas requiere otro mecanismo por lotes, no está resuelto por este cambio. Ninguna de estas condiciones renueva la fecha de una oferta.

La activación y medición real se registran en `docs/direccion/LECTORES_VARIANTES_2026-10-11.md`. La configuración original del ensayo mantiene 900 segundos, hasta 200 ofertas/400 HTTP/20.000 escrituras remotas diarias y cierre el 12/10/2026 a las 15:03:10.335 UTC.

Reversión independiente: detener el LaunchAgent antes de restaurar el ciclo anterior. Revertir código no revierte un delta ya confirmado: conservar el checkpoint y recibo que coincidan con la generación remota. Nunca reemplazar únicamente el marcador por uno anterior. Conservar la copia privada y los artefactos de antes/después.
