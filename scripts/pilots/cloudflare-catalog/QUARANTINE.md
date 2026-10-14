# Retirar una asociación incorrecta de la comparación

`quarantine-sqlite.ts` se usa cuando la oferta tiene evidencia pública de otra variante y su destino correcto todavía no existe en la muestra. Conserva la oferta y el producto; nunca inventa un destino ni una observación.

El coordinador proporciona `offerId`, hash actual de toda la fila, título de la publicación y evidencia `public-detail` con URL, fecha y SHA256. El adaptador verifica el archivo, H1, canonical y atributos de CPU, GPU o RAM. Rechaza una fuente equivalente al producto actual, un lease vigente, fila cambiada, URL ajena o callback asincrónico.

`applyQuarantinePlan` confirma en una transacción: revisión `needs-review` vinculada al producto y la fuente, eliminación de todas las bases comparables de esa oferta, resumen, proyección, generación de caché y auditoría durable. Conserva precio, stock y fechas de observación. La cola permanece íntegra, incluidos intentos y backoff. Un error revierte todas las escrituras. Una repetición idéntica comprueba otra vez evidencia y estado antes de devolver `already-applied`.

La revisión de identidad no significa precio reciente. Después de incorporar el destino correcto mediante un flujo separado, hay que reparar la asociación y obtener una observación real antes de comparar.

Prueba concreta: `quarantine-sqlite.test.ts`, 18 casos con SQLite real. Compilar los tests con esbuild conservando las dependencias externas; ejecutarlos con Node. El módulo de proyección lee `projection.sql` relativo a su archivo original: importarlo dinámicamente desde la ubicación original en herramientas operativas, sin incluirlo dentro de un bundle ubicado en outputs.

Para sincronizar el piloto se usa el transporte existente con marcador esperado y delta de productos afectados. No autoriza ampliar membresía ni modificar producción. La recuperación desde checkpoint evita consultar otra vez las tiendas.

Prueba operativa del 11/10: dos ofertas retiradas de comparación, cola y 1.366 ofertas conservadas; delta remoto confirmado con 53 escrituras. Después del tick automático, seis consultas remotas coinciden con SQLite y mantienen las exclusiones. Recibos `quarantine-pilot.json` y `search-check.json` en `outputs/recuperacion-asociaciones-2026-10-11/`.

Reversión: detener consumidores, preservar checkpoint y recibos y restaurar una copia completa previa. Restaurar sólo `row_json` dejaría proyección, resúmenes y caché inconsistentes. Un remoto ya confirmado necesita un delta nuevo verificado; no sustituir su marcador.
