# Segunda recuperación del catálogo — 11/10/2026

Trabajo en `codex/busqueda-funcional`, copia `correcciones-auditoria-web`. Sólo copias de la Mac y el piloto privado de Cloudflare. No se envió código a GitHub, desplegó la página, escribió en Supabase ni contrató servicios.

## Resultado comprobado

La copia completa conserva 59.692 productos, 73.827 ofertas y 34 tiendas. Siete asociaciones adicionales quedaron reparadas, once acumuladas con la tanda anterior. Integridad SQLite correcta y cero errores de claves foráneas. Mover una oferta conserva precio, stock y fechas; retira sus bases comparables hasta otra lectura real.

| Oferta | Asociación corregida | Observación nueva de esta tanda |
|---|---|---|
| Dinobyte RTX 5080 ASUS TUF OC 16GB | Estaba en ASUS PRIME | $4.187.300, sin stock; no comparable |
| GoldenTech Ryzen 7 8700G con cooler | Destino omitía el cooler | $454.586, disponibilidad en 24–48 hs; stock desconocido |
| CompraGamer i5-12600K BULK OUTLET | Estaba en producto ordinario | $328.100, con stock |
| CompraGamer i9-14900 BULK OUTLET | Estaba en producto ordinario | $1.020.550, stock bajo |
| CompraGamer RTX 5060 ASUS DUAL OC ADVANCED | Estaba en EVO | $859.900, con stock |
| FullH4rd 29893, RTX 5080 ASUS PRIME OC | Estaba en RX 9070 XT TUF | Identidad comprobada; no se renovó precio |
| FullH4rd 29681, RTX 5080 MSI GAMING TRIO OC | Estaba en 5070 Ti Frieren | Identidad comprobada; no se renovó precio |

Las cinco observaciones nuevas ocurrieron entre 16:25:24 y 16:25:30 UTC, con cinco solicitudes HTTP: tres a las fuentes públicas compartidas de CompraGamer y dos a fichas conocidas. Tres quedaron comparables. Outlet sigue siendo una condición de identidad explícita; no se mezcla con producto ordinario.

La tanda anterior observó 357 ofertas de CompraGamer; las tres recién recuperadas elevan el acumulado local a 360 ofertas distintas. Esto no acredita actualización de las 73.827 ofertas ni disponibilidad futura.

En 18 candidatos de la captura compartida con conflicto, sólo tres tenían un destino existente y único con prueba exacta. Los demás quedaron pendientes. No se eligió una variante por semejanza.

## FullH4rd: resultado de la investigación automática

Chrome habitual abrió las publicaciones 29893 y 29681. Se comprobaron H1 y SKU VGA2831/VGA2807; el modelo MSI es G5080-16GTC. Los archivos `*-dom-identity.html` son fragmentos fieles del DOM para identidad, no respuestas HTTP completas ni evidencia de renovación automática de precio.

El catálogo público anunció 1.888 resultados en este corte, doce por página. No se capturaron todas las páginas. Las sugerencias usan POST a `/_func/search.php` y `/_func/searchmob.php`, respondieron en el navegador habitual y ofrecen hasta seis coincidencias sin precio ni stock. No prueban cobertura completa ni una fuente automatizable fuera de esa sesión.

El primer intento MCP devolvió fallo de limpieza del navegador. Se distinguió ese error de transporte del acceso al sitio. La captura posterior desde REA CLI con Chrome visible, URL sin www y doce segundos de espera sí produjo evidencia: redirección 307, documento 403 y DOM final «Un momento…», 29.120 bytes. Evidencia `ev_953c1e02a41eb4236ff0f00db2de159e6ff3be611a2847e20c6d3994c0fe920d`. El registro de eventos quedó incompleto por solicitudes aún en curso; no se presenta como captura íntegra de red.

REA crea un perfil aislado; no comparte la sesión del Chrome habitual. No se alteró la configuración global ni se copiaron cookies. `doctor` informó diferencias de configuración, pero eso no acredita la causa del bloqueo. La actualización automática FullH4rd continúa sin una fuente reproducible validada.

## Publicaciones faltantes y lectores

GoldenTech ahora distingue disponibilidad en 24–48 horas de stock confirmado. La etiqueta principal visible prevalece sobre el texto genérico de stock bajo; una publicación explícitamente agotada sigue agotada. Recomendaciones o elementos ocultos no definen stock.

Tres fichas Mexx devolvieron HTTP 200, «NO DISPONIBLE» y ausencia de precio principal. Dos conservaban metadata antigua con precio/InStock: se ignoró correctamente. No se rejuvenecieron sus fechas.

Siete solicitudes públicas adicionales buscaron alternativas de enlaces caídos: cuatro HTTP 200, dos 401 y una redirección. MaxTecno tiene una publicación válida 8700G de $484.956,79, ya conocida y observada antes; no hay SKU histórico suficiente para demostrar continuidad del enlace 404. GamersPoint devolvió variantes diferentes y TheGamerShop ningún reemplazo. No se recuperó ningún enlace 404 con continuidad comprobada.

## Piloto remoto y automatización

El piloto conserva 1.012 productos y 1.366 ofertas. Los destinos correctos Dinobyte/GoldenTech faltan allí: se retiraron sus bases comparables y se guardó revisión `needs-review`, sin borrar ofertas ni alterar la cola. Recuperación atómica desde checkpoint: 53 escrituras D1, cero lecturas adicionales a tiendas.

La pausa de tienda ante 403/429 se confirma junto con el ACK en SQLite y se consulta antes de reclamar ofertas, incluso desde el consumidor directo. Dura al menos seis horas; Retry-After puede ampliarla hasta veinticuatro y otro ACK no la acorta. Un proceso nuevo respeta la misma pausa. La reclamación individual evita leer una segunda oferta de la tienda después del bloqueo.

Se reactivó el LaunchAgent original, cada quince minutos y hasta el 12/10/2026 a las 15:03:10 UTC (12:03 en Argentina). Se mantienen 200 intentos, 400 solicitudes HTTP y 20.000 escrituras remotas diarias como límites del ensayo. La base completa no está programada para actualizarse íntegramente.

El primer tick tras reactivarlo terminó: Katech sin observación válida, Dinobyte con disponibilidad incierta y MaxTecno comparable. El presupuesto acumulado del ensayo quedó en 36 intentos, 40 solicitudes HTTP, 277 escrituras remotas y una reserva conservadora de 4.000 escrituras.

Cobertura a las 16:37:23 UTC: 164 ofertas soportadas y 1.202 sin capacidad validada; ocho observadas en el ensayo, seis comparables. Las 76 observaciones recientes y 40 comparables recientes incluyen datos heredados: no se atribuyen al ensayo. Las 28 fallidas siguen registradas. Las categorías, tiendas y atributos pendientes permanecen en el denominador.

## Consumo y pruebas

Los tres deltas de esta tanda recibieron confirmación con 20 + 53 + 27 = 100 escrituras D1. Las seis consultas posteriores al tick consumieron 1.383 lecturas y coincidieron con la búsqueda local. Hubo otras seis consultas antes del tick, también 1.383 lecturas. Los ciclos de estado y sincronización sumaron 127 lecturas en sus recibos; el mínimo directo registrado de esta tanda es 2.893 lecturas, sin sumar las dos comprobaciones auxiliares del marcador remoto.

Analytics a las 16:39:14 UTC informó 335.163 lecturas y 23.589 escrituras del día; 253 solicitudes del Worker, cero errores, CPU p50 1,220 ms y p99 9,257 ms. Respecto del corte de las 16:26:11, incorporó 91 lecturas y 73 escrituras; todavía no había incorporado todas las consultas y el último delta. Conservar recibos junto al agregado evita confundir demora de Analytics con consumo cero.

El plan gratuito admite cinco millones de filas leídas y cien mil escritas por día, compartidas por cuenta. [Cuotas D1](https://developers.cloudflare.com/d1/platform/pricing/). El CPU gratuito tiene un límite de diez milisegundos por invocación; la muestra tiene poco margen en p99. [Límites Workers](https://developers.cloudflare.com/workers/platform/limits/). No se demuestra todavía que el catálogo completo funcione estable dentro de esa cuota.

Pasaron 123 pruebas Node y 115 Vitest; TypeScript sin errores; ESLint sin errores y una advertencia preexistente en el encolado. Integridad completa, siete asociaciones y once filas de auditoría comprobadas. Búsqueda: 14/14 casos locales en diez familias iguales al cálculo original y 6/6 consultas remotas después del tick. Revisión independiente dirigida sin hallazgos materiales confirmados; no sustituye las pruebas operativas.

La página mantiene despliegue `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100%, fecha y etag idénticos al corte inicial. No basta HTTP 200: se contrastó metadata del despliegue.

## Evidencia y siguiente prioridad

Recibos privados en `outputs/recuperacion-asociaciones-2026-10-11/`: `applied-five.json`, `applied-full-two.json`, `new-shared-observations.json`, `new-detail-observations.json`, `quarantine-pilot.json`, `scheduler-after-recovery.json` y `search-check.json`. REA en `outputs/fullh4rd-rea-2026-10-11/second-rea-proof.json`; consumo y producción en `outputs/ciclo-automatico-mac-2026-10-11/segunda-recuperacion-*.json`. Los secretos y copias de base no se versionan.

Prioridad: ampliar prueba exacta de variantes y capacidad de familias, y resolver una fuente pública FullH4rd reproducible antes de automatizar su catálogo. Para los 404, demostrar ID/SKU y continuidad antes de reemplazar URL. Después medir importación y carga completas dentro de las cuotas, antes de conectar la página publicada. Aumentar intentos sobre variantes ambiguas o fuentes bloqueadas sólo desperdicia solicitudes.

Reversión por unidad: restaurar lectores/bundle sin alterar observaciones; retirar el soporte de evidencia compartida sin deshacer precios observados; conservar pausas al restaurar consumidor; detener escritores y restaurar copias completas anteriores para revertir asociaciones/cuarentenas. Una sincronización remota ya confirmada requiere otro delta verificado y no permite volver a un marcador antiguo por asignación directa.

## Unidades de revisión local

- `22fa6e9`: disponibilidad incierta GoldenTech y pruebas Mexx, 59 líneas cambiadas.
- `664ab45`: evidencia de identidad del catálogo compartido, 52 líneas.
- `fb5c32a`: pausa durable y consumidor directo, 176 líneas.
- `379f84e`: cuarentena transaccional y auditoría, 340 líneas.

Cada unidad incluye sus pruebas y reversión. Este informe conserva por separado los resultados operativos. Ningún commit se envió a GitHub.
