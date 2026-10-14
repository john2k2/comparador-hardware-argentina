# Pausa durable de lectores por tienda

`refresh-demand.mjs` confirma el ACK y la pausa de tienda en la misma transacción SQLite. Un 403/429 impone al menos seis horas; `Retry-After` puede ampliarla hasta veinticuatro. Un ACK posterior nunca acorta la pausa existente.

La reclamación de ofertas consulta `pilot_cycle_store_pause`, tanto desde el ciclo automático como desde el consumidor directo. `refresh-local.ts` reclama una oferta por vez: tras el primer bloqueo no lee otra de esa tienda; puede continuar con otra tienda permitida. El lote de catálogo compartido conserva su contrato de reclamar antes de una única lectura.

La pausa sobrevive a un reinicio y no altera precio, stock, fecha ni intentos de ofertas no reclamadas. El ciclo automático deja de escribir la pausa después del ACK; así se elimina el intervalo en el que un cierre inesperado dejaba cola confirmada y tienda sin protección.

`store-pause.test.ts` comprueba 403, 429, otra tienda, reapertura desde un proceso nuevo, vencimiento exacto, Retry-After y rollback provocado después de escribir el ACK. Los tests generales de cola, consumidor, catálogo compartido y ciclo cubren los contratos existentes.

Verificación: 6/6 pruebas nuevas; suite conjunta de piloto, 123/123 Node. Al recompilar y reactivar el consumidor, el LaunchAgent terminó su primer tick con tres intentos, dos observaciones y 27 escrituras remotas. Una observación de disponibilidad incierta quedó excluida. Recibo `outputs/recuperacion-asociaciones-2026-10-11/scheduler-after-recovery.json`.

Reversión: detener el scheduler y restaurar módulos/bundle anteriores. Mantener la tabla de pausas y su contenido; retirar sólo código no autoriza reiniciar límites ni borrar backoff. La prueba operativa conserva inicio, presupuesto y vencimiento de la configuración existente.
