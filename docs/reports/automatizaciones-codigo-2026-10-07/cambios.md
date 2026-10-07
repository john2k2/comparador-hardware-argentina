# Correcciones locales de la revisión

Base `638d6da`, rama `codex/optimizacion-automatizaciones`, copia aislada comparador-confianza. Código publicado de referencia `99d5917`; esta preparación no acredita publicación ni recuperación física de capacidad.

## U1: conservar una caché renovada durante su lectura

El borrado por clave de una entrada vencida podía eliminar una renovación concurrente posterior al SELECT. Ahora el DELETE exige la misma expiración observada y que siga vencida al corte. Una fecha inválida produce ausencia de caché sin borrado. No cambia precios, stock, timestamps de oferta ni elegibilidad.

Prueba focal: `npx vitest run src/lib/server/shared-cache.test.ts`, **16/16 aprobadas**. ESLint de los dos archivos: exit0. Se reprodujeron renovación concurrente, entrada que sigue vencida y expiración inválida. Verificación sintética, sin conexión ni borrado remoto.

Reversión: retirar los cambios de `src/lib/server/shared-cache.ts` y su test de esta unidad; conservar wrapper/retención, scheduler y diagnóstico del resto de la entrega. El arreglo evita un borrado indebido; no demuestra reducción de bytes de la base.

## U2: hacer observables los fallos de escritura

Las escrituras de caché ahora comprueban el ACK devuelto y los rechazos. Conservan servicio local y best effort. La persistencia de telemetría comprueba ambos fallos, registra sólo scope controlado y SQLSTATE validado y rechaza con `OPERATIONAL_TELEMETRY_WRITE_FAILED`; el recorder mantiene su contrato. Los mensajes de SDK, claves, URLs, payloads y credenciales no se registran.

Pruebas focales: 29/29 en shared-cache y storage; ESLint de cuatro archivos exit0. Revisión independiente de U1/U2/A1: 68/68, sin hallazgos materiales. Estas pruebas no garantizan entrega al terminar el Worker; las escrituras en background se conservan y no se afirma reducción de volumen.

Reversión: revertir esta unidad local conserva U1 y restaura el manejo anterior de errores; no requiere operación DB.

## A1: recuperar un turno próximo al vencimiento de su guarda

El respaldo admite una sola espera de hasta diez segundos ante una negativa válida con vencimiento próximo. Después relee GitHub y la misma RPC. Conserva 75 minutos entre inicios listados, una adquisición por ventana de 3600 segundos y un único dispatch. Presupuesto total de aplicación: 60 segundos; request de hasta ocho segundos ajustado al resto. Un 403 o timeout no libera la guarda ni repite el despacho.

Prueba focal: 39/39; ESLint y TypeScript sin emisión exit0. Revisión independiente sin hallazgos materiales, incluyendo la unión de 68 casos con U1/U2. Se prueban tiempos 6/10/11 segundos, timer demorado, segunda negativa, relectura y dos eventos concurrentes. No hubo dispatch real ni lectura DB.

Los [límites oficiales de Cloudflare](https://developers.cloudflare.com/workers/platform/limits/#duration) y su [handler scheduled](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) distinguen wall time de CPU. La espera cabe en el contrato documentado de cron; no demuestra que el código local esté publicado ni mide CPU. Reversión: revertir esta unidad local devuelve el comportamiento previo sin cambiar el bucket o la base.

## U3: reducir las columnas del estado usado para deduplicar

La lectura de product_prices usa seis columnas consumidas por identidad, firma, fecha y revisión; la RPC de precios/historial conserva su contrato. Pruebas: 25/25 en catálogo/dedupe y lint focal exit0. El mock aplica la proyección y reproduce rechazo de observación vieja, dedupe, touch real, revisión diferente y poda que conserva una oferta reciente. Revisión independiente sin hallazgos.

Reduce columnas transferidas y procesadas; bytes, CPU, latencia y ahorro de cuota no están medidos. Reversión: restaurar select('*') en esta consulta; no requiere cambios DB.
