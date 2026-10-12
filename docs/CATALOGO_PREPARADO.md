# Lectura del catálogo preparado

El modo preparado es optativo y conserva los registros de precio originales. La
Mac ejecuta el mapper y las reglas de identidad; firma el resultado con una clave
local. El Worker sólo recibe la clave pública. La firma no renueva observaciones
ni convierte un stock desconocido en una oferta comprable.

## Construcción y activación

1. Normalizar y comprobar el catálogo completo con las reglas vigentes antes de
   preparar las vistas. Conservar una captura recuperable de fuente y marcadores.
2. Ejecutar `prepared-policy.mjs` y comprobar su resultado con `--check`. El
   `prebuild` lo genera automáticamente; una publicación nativa también exige la
   comprobación explícita. Cambiar el código de las reglas invalida la política.
3. Instalar/certificar `prices_observed_idx` mediante
   `installObservationClockIndex`. Esta función rechaza diferencias entre fechas
   JavaScript/SQLite, tipos indebidos y conteos incompatibles. No modifica fechas.
4. Usar `buildPreparedView` con fuente de sólo lectura, destino separado, política
   compilada y clave privada de firma inyectada. Guarda `[payload, signature]` y
   devuelve `storageVersion: 2`. Un reintento idéntico conserva las mismas filas.
5. Comparar el destino remoto completo con la copia local y comprobar nuevamente
   la generación primaria antes de activar el marcador. Presupuestar índices,
   vistas, verificaciones y mantenimiento dentro del consumo diario de la cuenta.
6. Activar `CATALOG_PREPARED_VIEWS=1` y `CATALOG_PREPARED_PUBLIC_KEY` exclusivamente
   junto a un catálogo certificado. Mantener el emisor privado fuera del Worker,
   del repositorio y de toda variable `NEXT_PUBLIC_*`.

El lector exige política, clave, formato y conteos compatibles; comprueba firma,
identidad, oferta original, estadísticas SQL y generación. La respuesta al
navegador y la caché pública no contienen el transporte preparado.

## Reloj y recuperación

La caché conserva el vencimiento real de las ofertas. Para las lecturas sin un
intervalo global vigente, el índice considera todas las observaciones positivas,
incluso ofertas futuras o históricas que todavía no representan a su tienda.
El lector vuelve a comprobar el intervalo después de las esperas de base de datos
y caché. Una transición durante la consulta produce 503 y exige otra lectura.

Los escritores de ofertas deben conservar la equivalencia temporal certificada,
actualizar conteos/marcadores y reconstruir las vistas afectadas. Una nueva
política exige preparar nuevamente las vistas; no activar primero un Worker que
exige una política ausente. La rotación de código/datos debe probarse en privado
antes de elegir el procedimiento de publicación y recuperación.

Desactivar el modo preparado conserva el lector ordinario y sus controles; el
índice y su certificación siguen siendo necesarios para los casos de reloj que
los requieren. La recuperación debe usar datos y marcadores de la misma captura.
No restaurar por separado precios, resúmenes, proyecciones o firmas.

## Verificación pendiente de producción

`npm test` cubre el consumidor y el lector. `npm run test:ops` ejecuta también los
contratos del productor y del índice. Estas pruebas no sustituyen la medición
remota del catálogo completo, el consumo de varios ciclos de actualización ni
la revisión de búsqueda, detalle y comparación en la interfaz publicada.

El piloto remoto actual verifica una selección de modelos elegibles del corte
de origen. Todavía no acredita la carga ni la actualización de toda la base en
Cloudflare, ni el rendimiento gratuito bajo consultas sin caché.
