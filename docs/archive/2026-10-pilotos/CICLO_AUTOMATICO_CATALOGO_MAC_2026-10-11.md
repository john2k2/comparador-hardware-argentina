# Ciclo automático del catálogo: piloto activo y cobertura parcial

El 11/10 se comprobó actualización automática Mac → SQLite privado → delta D1 → búsqueda → navegador. El ensayo está activo cada **15 minutos hasta el 12/10/2026 a las 15:03:10 UTC, 12:03:10 en la Mac**. Workers continúa en el plan gratuito. La página publicada conserva su versión; no se escribieron datos en Supabase ni se publicó en GitHub.

## Resultado medido

Corte local: **11/10, 15:11:09 UTC**. La muestra contiene **1.012 productos y 1.366 ofertas de 25 tiendas**, con diez familias. Las 34 tiendas configuradas no equivalen a 34 tiendas con ofertas en esta muestra.

| Estado | Ofertas | Qué acredita |
|---|---:|---|
| Guardadas | 1.366 | Denominador completo de la muestra, no catálogo completo de las tiendas |
| Admitidas para intentar refresh | 162 | Tienda/URL autorizada, CPU/GPU/RAM y atributos suficientes del destino; no garantiza respuesta ni identidad de la fuente |
| Fuera del consumidor actual | 1.204 | 732 por familia, 430 por tienda y 42 por destino/atributos; clasificación por primera causa |
| Intentadas en seis ejecuciones | 18 | Tres arranques del scheduler y tres activaciones por intervalo, sin ejecutar manualmente el consumidor |
| Observadas y comparables en este ensayo | 1 | Fuente real, precio/stock/identidad revisados, persistencia local y D1 confirmados |
| Intentos fallidos de este ensayo | 17 | Sin cambiar precio ni fecha; pausa por oferta y, ante 403/429, por tienda |
| Pendientes admitidas | 144 | Todavía no observadas en este ensayo |

Las seis ejecuciones duraron entre 2,55 y 7,59 segundos. Al principio se probaron intervalos de 60 segundos; después se reinstaló a 900 segundos sin reiniciar cursor, cola ni presupuesto. El primer ciclo diario recorrió el denominador completo; completar esa programación **no significa completar sus observaciones**. El próximo barrido queda programado a 24 horas del inicio del primero; el corte de seguridad de este ensayo vence antes de ese segundo barrido. Las pruebas locales sí cubren varios barridos y reinicios.

Hay 72 ofertas observadas dentro de 24 horas, 38 comparables; incluyen observaciones anteriores a este ensayo. En tres horas hay cuatro observadas y comparables: sólo una es nueva en este ciclo. No se amplió la ventana de tres horas de las guías. La muestra contiene 1.024 ofertas de otras familias sin prueba exacta implementada; parte ya queda clasificada primero por tienda en la tabla anterior. RAM tampoco tiene destinos con todos los atributos suficientes en esta muestra.

**Observación nueva:** Gaming City, AMD Ryzen 5 5500, **$179.550**, precio especial, `in-stock`, observado **2026-10-11T15:08:00.806Z**, 12:08:00 en la Mac. [Publicación verificada](https://www.gamingcity.com.ar/micro-amd-procesador-amd-ryzen-5-5500-am4-6-nucleos-12-hilos-sin-video--det--8687). Oferta `2b08bf74-5bab-4e75-85d0-b396d04024e2`. Sólo cambió esa oferta; los diecisiete destinos fallidos quedaron idénticos. No se acredita cooler incluido ni disponibilidad futura.

La categoría operativa es procesadores; las claves canónica/variante heredadas todavía contienen `almacenamiento`. La prueba exacta de la observación acredita el modelo contra su destino, pero no corrige esas asociaciones heredadas ni certifica comparaciones globales. FullH4rd volvió a responder 403: no tiene observación nueva.

## Consumo y búsqueda

| Operación medida | Lecturas D1 | Escrituras D1 |
|---|---:|---:|
| Seis ciclos: control y un delta | 43 | 39 |
| Control inicial de generación | 1 | 0 |
| Búsqueda en navegador y tres comprobaciones API | 5.569 | 0 |
| Total de operaciones de este ensayo | **5.613** | **39** |

Las fuentes recibieron **19 solicitudes HTTP para 18 intentos**; una redirección explica la diferencia. Se ejecutan desde la Mac, separadas del consumo D1. El delta válido usó 37 lecturas y 39 escrituras, además de la lectura de estado del ciclo. Sólo lleva ofertas, base comparable, resúmenes/proyección y generación: no cola, usuarios, historial privado ni SQL libre.

La consulta API `Ryzen 5500`, filtrada por Gaming City, coincidió tres veces con el lector local del mismo corte: MISS **993 ms / 3.390 filas**, HIT **189 ms / 1 fila**, HIT **136 ms / 1 fila**. El navegador mostró el mismo precio, condición, stock y fecha, con 1.679 ms y 2.177 filas para su consulta sin filtro de categoría. Son consultas pequeñas y distintas; no prueban latencia mundial ni todas las búsquedas.

El primer intento de estadísticas agregadas fue rechazado por el límite de consultas de Analytics. No se interpretó como consumo cero. A las **15:11:37 UTC**, el proveedor informó para este D1 **259.396 lecturas y 23.378 escrituras acumuladas del día**, incluidos ensayos anteriores. Respecto al corte anterior confirmado de 14:37:26, el incremento coincide con 5.613/39. Es aproximadamente 5,19%/23,38% de los límites gratuitos de 5 millones/100 mil. Las estadísticas tienen demora: un corte anterior todavía no incluía el delta.

La ventana de CPU de este ensayo registrada por Cloudflare contiene once invocaciones, cero errores, p50 **1,145 ms**, p99 **8,437 ms**, bajo el límite gratuito de 10 ms en este corte. Es telemetría parcial, no un techo probado para cargas mayores. El percentil diario de 10,224 ms incluye pruebas anteriores y no se presentó como el resultado de este ciclo. El panel confirmó **Gratuito / Plan actual / 0 USD**; no se contrató ningún servicio.

## Operación y recuperación

- `ar.comparador.catalog-pilot` es un LaunchAgent del usuario en esta Mac, no una automatización de Codex. Ejecuta `automatic-cycle.mjs --tick` con rutas absolutas y sin shell. No requiere tener este chat abierto; requiere la Mac encendida y con la sesión disponible. Dormida/apagada no revisa fuentes. Al volver continúa con estado durable si todavía está dentro del ensayo; después del corte sólo limpia el secreto y detiene su propio horario.
- Límites por **día UTC**: 200 intentos, 400 solicitudes HTTP a tiendas y 20.000 escrituras remotas. Cada tick admite tres ofertas de hasta tres tiendas. Reserva doce HTTP para cubrir redirecciones y 4.000 escrituras antes del lector; devuelve sobrante sólo con recibo conocido. La cuota gratuita es compartida: estos límites no reservan capacidad para otros Workers.
- Rotación por tiendas y por familias; cursor y cola se confirman juntos. Nunca reemplaza un lease ni saltea un backoff por una búsqueda repetida. La cola vence a las 48 horas; no rejuvenece un precio. Los errores tienen al menos seis horas de pausa. No evade bloqueos.
- Lease durable del ciclo de diez minutos evita procesos solapados. Una respuesta perdida conserva la reserva; antes de otro lector consulta generación y recupera el outbox o lo reconstruye desde checkpoint. Generación ajena bloquea el ciclo. Los temporales de checkpoint tienen UUID y no borran residuos ajenos.
- El Worker sólo admite el secreto privado, no tiene rutas del dominio público, cron ni bindings Supabase. Después del corte rechaza **antes de acceder a D1**, aunque la Mac esté apagada. El secreto generado está en archivo 0600 dentro de directorio 0700; no se incluyó en Git ni en el navegador. El puente temporal del navegador se cerró; el horario queda activo.

Archivos de operación: `scripts/pilots/cloudflare-catalog/{automatic-cycle,mac-scheduler,rotation-local,cycle-remote}.mjs`. Configuración privada y recibos: `outputs/ciclo-automatico-mac-2026-10-11/`. Para consultar o detener sólo este ensayo desde el worktree:

```bash
node scripts/pilots/cloudflare-catalog/mac-scheduler.mjs status
node scripts/pilots/cloudflare-catalog/mac-scheduler.mjs stop
```

`stop` retira el horario local; para detener también el servicio remoto antes del corte, el coordinador despliega únicamente su configuración pausada `wrangler.remote.jsonc`, nunca el Worker público. No extender automáticamente este ensayo ni instalar otro horario sobre uno existente.

## Evidencia de cierre y siguiente prioridad

**156 pruebas aprobadas:** 54 de cola/rotación/ciclo/transporte/sync/Worker, 20 del consumidor y 82 de parsers Woo/batch/detalle. Typecheck completo aprobado; lint sin errores, con un warning previo por import sin uso. `git diff --check` y `PRAGMA integrity_check=ok`. Revisión independiente de recuperación y presupuesto, sin P1/P2 abierto. Las pruebas no reemplazan las dieciocho lecturas reales y la confirmación D1.

Recibos: `final-receipt.json` (seis ciclos, cobertura por tienda/familia, ofertas cambiadas y fallidas intactas), `first-success.json`, `search-readback.json` (paridad MISS/HIT), `busqueda-gamingcity-actualizada.png`, `cloudflare-before/after/final.json`, `trial-cpu.json`, `scheduler-status.txt`, `tests.txt`, `consumer-tests.txt`, `source-tests.txt`, `typecheck.txt`, `lint.txt`. El consumidor conserva título/categoría públicos leídos cuando una observación se rechaza; ese diagnóstico no se guarda como precio fresco.

La producción conserva etag `65a4409c5771aab6f53a38e9b601d8fa290cde627d6be4b84dbbb1f02fe2cb2e`, deploy `5b77fc37-9fea-48df-aca5-e1c43956f0a6` y versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100%, iguales antes/después. El código se conserva únicamente en commits locales del worktree `codex/busqueda-funcional`.

La prioridad siguiente es **corregir asociaciones y lectores que rechazan fuentes válidas, mantener rechazadas las variantes realmente diferentes y encontrar fuentes verificables para tiendas bloqueadas**. Después, añadir pruebas de identidad y lectores para las otras familias y descubrimiento incremental de altas/bajas. Rotar lo guardado no descubre nuevos productos ni confirma cobertura completa de una tienda. Con una sola observación válida de dieciocho intentos, no hay evidencia suficiente para migrar la búsqueda pública ni llamar actualizado a todo el catálogo.
