# Persistencia de observaciones

La cola adaptativa no hereda un dictamen si cambió la fuente observada. Prioridad y solicitudes usan RPC verificadas que guardan fuente y condición de pago en la misma transacción, después de validar el enlace entre dictamen y evidencia. Locks, leases, idempotencia e historial siguen bajo sus contratos anteriores. Las RPC anteriores se conservan para rollback de código.

Validación: fixtures de prioridad/worker/inventario y SQL de evidencia, más dos pruebas de concurrencia. Rollback: consumidor anterior puede operar conservando las nuevas funciones y evidencia; no revertir fechas de observación ni reencolar manualmente para disimular fallos.
