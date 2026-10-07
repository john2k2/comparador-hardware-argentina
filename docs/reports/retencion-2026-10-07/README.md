# Retención y capacidad: estado vigente

**Piloto de caché ejecutado y cerrado: exactamente 1000 eventos vencidos, cuatro commits de 250. Capacidad física sin mejora medida.** Jonathan autorizó el piloto previamente presentado con «ok continua con tu recomendacion». La autorización no se amplía por filas elegibles restantes.

- [Ejecución, conciliación y comprobación pública](ejecucion/README.md).
- [Capacidad: tamaños, alternativas y límites](capacidad/PLAN.md).
- [Ciclo natural de la versión publicada](ciclo-natural/README.md): resultado nuevo todavía pendiente en su corte.
- [Propuesta y prueba sintética anteriores](PLAN.md): evidencia histórica anterior a la autorización y ejecución, conservada con su fecha.

El código productivo sigue en `99d5917`: lectores/diagnóstico de fuentes y favicon, sin índices nuevos. La candidata local `codex/retencion-comprobable` exige un comprobante completo de `cleanup_price_history`: contadores enteros seguros no negativos, política 14/90/365 y fecha completa, con zona y calendario válido. Conserva datos del servidor, incluidos microsegundos; elimina los reemplazos por cero y hora local. No exige una igualdad entre contadores tomados bajo inserciones concurrentes.

Esa unidad, commit local `0ba14fc`, pasó **64/64 pruebas enfocadas**, lint de los dos archivos, tipos y revisión independiente. El P2 inicial de `Date.parse`, que aceptaba `"0"` o días imposibles, fue corregido y revisado de nuevo. [verificacion-local.json](verificacion-local.json) registra la fuente, hashes, pruebas y revisión. **La candidata está local: no se publicó ni se ejecutó la RPC de historial.** Rechazar una respuesta incompleta después de la RPC no demuestra rollback remoto ni permite reintentar a ciegas.

## Recomendación de dirección

1. Demostrar ejecución natural y utilidad del catálogo publicado. Mantener muestra/denominadores G02; un workflow verde no sustituye ofertas elegibles guardadas.
2. Preparar retención de historial aislada y acotada con corte, candidatos, límites, preservación de la última observación por oferta/bucket y recibos reales. El endpoint legado `cleanup-history` también elimina ofertas fantasma; no usarlo bajo una aprobación limitada a historial.
3. Dimensionar recuperación física sólo con margen, respaldo, locks y espacio temporal comprobados. La base mide 929,2 MB; aun restar toda la caché deja 683,8 MB. Un índice duplicado visible ofrece apenas 1,4 MB. No hay una solución bajo 500 MB a costo cero demostrada todavía.

No ampliar fuentes, monetización o refactors para eludir estos bloqueos. Comparar componentes y armar una PC conservan igual prioridad; la finalidad es que el usuario encuentre ofertas fiables y vuelva, no acumular ejecuciones o archivos. Una sesión de capacidad debe producir una reducción medible con margen o una decisión explícita sobre costo/alcance; repetir borrados sin resultado físico no cuenta como progreso de cuota.
