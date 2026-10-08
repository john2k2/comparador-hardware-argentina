# Continuación explícita entre etapas conciliadas

El helper local conserva el corte `2026-10-08T20:16:00.000000Z`, la cohorte inicial de 342.993 eventos y los topes originales de 343.000 selecciones / 32 MiB reservados. Una etapa posterior descuenta todo lo gastado; no renueva presupuesto porque cambie su carpeta o código.

Exige resumen privado sin ACK incierto, diferencias ni fallo de journal; seleccionadas = archivadas = retiradas = intentadas. Contrasta además un conteo independiente al mismo corte, y enlaza SHA-256 del plan y resumen anteriores. Admite población cero en uno de los dos scopes. Cualquier divergencia detiene la preparación.

Esto no reanuda automáticamente, no autoriza una RPC y no prueba por sí solo la autenticidad de un archivo local modificado por su propietario. El coordinador tiene que revisar el journal completo, comprobar ausencia de operaciones pendientes y lock, leer el estado remoto, registrar un plan nuevo inmutable y un recibo de autorización vinculado a sus bytes exactos. Si hay incertidumbre, primero se concilia; no se vuelve a intentar la mutación.

Tres tests locales prueban presupuesto heredado hasta una tercera etapa, rechazo de incertidumbre/custodia incompleta/reinicio de límites/cambio de corte y aceptación de scope vacío. El helper está separado del proceso en ejecución; todavía no está integrado en el CLI activo.
