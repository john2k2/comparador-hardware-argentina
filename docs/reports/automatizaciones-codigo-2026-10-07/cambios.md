# Correcciones locales de la revisión

Base `638d6da`, rama `codex/optimizacion-automatizaciones`, copia aislada comparador-confianza. Código publicado de referencia `99d5917`; esta preparación no acredita publicación ni recuperación física de capacidad.

## U1: conservar una caché renovada durante su lectura

El borrado por clave de una entrada vencida podía eliminar una renovación concurrente posterior al SELECT. Ahora el DELETE exige la misma expiración observada y que siga vencida al corte. Una fecha inválida produce ausencia de caché sin borrado. No cambia precios, stock, timestamps de oferta ni elegibilidad.

Prueba focal: `npx vitest run src/lib/server/shared-cache.test.ts`, **16/16 aprobadas**. ESLint de los dos archivos: exit0. Se reprodujeron renovación concurrente, entrada que sigue vencida y expiración inválida. Verificación sintética, sin conexión ni borrado remoto.

Reversión: retirar los cambios de `src/lib/server/shared-cache.ts` y su test de esta unidad; conservar wrapper/retención, scheduler y diagnóstico del resto de la entrega. El arreglo evita un borrado indebido; no demuestra reducción de bytes de la base.
