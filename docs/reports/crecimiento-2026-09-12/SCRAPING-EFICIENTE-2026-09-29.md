# Scraping eficiente: implementación y piloto del 29/09/2026

Solicitud: reducir recursos y mantener publicaciones reales, precio/stock comprobados e identidad de variante. Se conserva G02 abierto: una implementación o un ciclo manual no reemplazan siete ciclos diarios útiles ni su muestra fija.

## Cambios

- Identidad de publicación separada de la ficha agrupada: CompraGamer usa su ID y Maximus `ITEM`; SKU de tienda no se interpreta como MPN/GTIN ni une fabricantes. El título e identificador de origen quedan en resultados de actualización y en la revisión de identidad cuando aplica, sin una escritura adicional de historial.
- RAM distingue serie compuesta/RGB, kit, CL y color. Lectura recalcula claves RAM antiguas sin cambiar IDs públicos. Contradicciones de kit y condiciones Outlet/usado quedan pendientes; una omisión no demuestra contradicción ni compatibilidad.
- Jev cachea cada evidencia (24 h, modelo y versión de prompt incluidos), comparte duplicados y envía únicamente faltantes en lotes de hasta ocho. Un cambio de precio/stock no modifica identidad; cambiar título/SKU/evidencia invalida la entrada. Se conserva fecha del dictamen y observación independiente de precio.
- Las búsquedas se crean como tareas pendientes antes del límite de concurrencia. Actualizaciones de una publicación compartida entre fichas reutilizan la lectura dentro de cada ejecución, pero revisan cada asociación por separado.
- CompraGamer comparte JSON de catálogo y soporta ETag/Last-Modified de ese JSON. Una respuesta 304 sólo valida el recurso de datos que contiene precios/stock; no se acepta como señal de precio el HTML de una aplicación. Caché HTTP en memoria de proceso: todavía no se promete ahorro entre runners nuevos.
- Maximus reutiliza una sesión anónima durante hasta cinco minutos o su expiración anterior, y busca una publicación conocida por su código. No usa cookies de Jonathan ni interpreta otra publicación parecida como reemplazo del ID original.
- Katech usa una única lectura directa de la URL conocida. Se ajustó su título real `h1.post_title`; se exige señal de stock, no ausencia de texto de agotado. Las otras plantillas WooCommerce conservan su adaptación anterior hasta verificar su detalle.
- Transporte del piloto: máximo tres solicitudes activas, una por tienda, separación de dos segundos, tiempo y cuerpo acotados, backoff progresivo ante 403/429/5xx y respeto de Retry-After. No evade bloqueos. Se registran solicitudes, bytes de cuerpo decodificado, duración incluyendo espera, 304, pausas y fallos. No son bytes facturados ni tiempos de CPU.
- Guías/prioridad y cola a pedido usan CLI en Node, sin iniciar Next dev ni abrir servidor HTTP. Los modos manuales antiguos conservan su runtime. Permanecen cuotas, leases, límites de ofertas, ventana de tres horas e historial sólo ante cambios reales.

## Evidencia previa a publicación

Prueba real de lectura, 17:02–17:03 UTC (sin persistir precios):

| Fuente | Solicitudes | Bytes decodificados | Resultado |
|---|---:|---:|---|
| CompraGamer | 3 | 2085622 | Catálogo, marcas y categorías; dos productos obtenidos con la misma observación, sin volver a descargar catálogo para el segundo. |
| Maximus | 3 | 415347 | Una apertura anónima y dos consultas, en vez de dos aperturas. La consulta de RAM devolvió ITEM 19958, distinto de ITEM 8958: no se intercambian. |
| Katech | 1 | 429923 | La primera lectura detectó diferencia de plantilla. Se corrigió el parser y se verificó sobre HTML capturado: Kingston NV3 1 TB, ARS 311039, señal explícita de stock y SKU DIS793. La prueba offline del parser no crea una observación nueva. |

La prueba no establece un porcentaje global de ahorro ni disponibilidad de las siete piezas de cada guía. Las métricas de red sólo cubren los adaptadores del piloto; no deben confundirse con todas las tiendas.

## Controles y límites

No se inventan MPN/GTIN ausentes ni se migran masivamente asociaciones dudosas. No se habilitan navegadores persistentes, proxies pagos ni sesiones personales. Descubrimiento y catálogo frío conservan sus modos controlados; no se añade un barrido nuevo de todas las tiendas. Guías, solicitudes explícitas y la muestra diaria siguen siendo prioritarias. Los modos tracked/hot existentes siguen disponibles; esta revisión no promete cobertura de todos los favoritos en cada hora.

Resultado de publicación y runner registrado a continuación. G02 conserva criterio y fecha de revisión; manuales y horarios no se suman a los siete ciclos diarios útiles.

## Publicación y ejecución real

- Commits `d4c718d` y `20e21d3` publicados; último ajuste `f15655c` conserva ocho minutos por job solicitado, añade prueba de concurrencia real y separa RGB de “sin RGB”. Workers Builds `f03c42f5-72f0-40ee-8d95-d343dbd99733` y `354f1f95-a88b-4e4c-be93-d17c84fddc91`: success; este último finalizó 17:21:28 UTC.
- Suite final: 917 tests aprobados, dos omitidos; lint y TypeScript aprobados. Build local aprobado; el build desplegado de Cloudflare verificó el último ajuste. CLI rechaza ejecutar si falta su gate de revisión. Pruebas cubren concurrencia real, stock desconocido, límites/backoff, caché inválida/expirada, cambio de título/SKU, orden/precio/stock sin nueva revisión y asociaciones independientes para una lectura compartida.
- [Runner 36603362470](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36603362470): success; 17:13:32–17:21:00 UTC, sin Next dev. 60 objetivos intentados, 47 observaciones persistidas, ocho productos distintos, 15 tiendas; 41 filas con precio positivo y disponibilidad. Sólo tres resultados de este ciclo fueron comparables contra la ficha; las 41 disponibles no acreditan identidad.
- Sin piezas faltantes en las guías al planificar, sin truncar muestra ni agotar plazo. Fue manual y no se suma a los ciclos diarios útiles.
- Muestra fija: 48/57 frescas ≤24 h y 48/57 ≤3 h; 40 pendientes de identidad y ocho candidatas sin ese estado, que tampoco prueban por sí solas identidad contra ficha/render. La variación de denominador respecto de 58 es disponibilidad observada; se conservan los nueve IDs de muestra.
- Catálogo global: 222/47636 frescas ≤24 h y 66/47636 ≤3 h. No equivale a catálogo completo actualizado; la prioridad sigue en guías y muestra acotada.
- Jev: ocho llamadas reales, 45 evidencias individuales guardadas; cero hits en el primer ciclo de esta caché nueva. Revisiones persistidas: 42 low-confidence, tres consistent-text y dos explicit-conflict. No hubo prueba de caída del proveedor ni de cuota agotada; no se rebajó el umbral para aumentar comparables.
- Métricas HTTP del piloto: CompraGamer 3 requests/2085625 bytes, Maximus 6/435886 y Katech 6/2587076, sin fallos HTTP ni 304 en este corte. Trece objetivos sin observación suficiente siguen pendientes; “sin observación” no significa agotado. Cero reutilizaciones entre fichas en esta muestra particular; deduplicación probada por tests, no contada como ahorro real aquí.
- Evidencia compacta: `SCRAPING-PILOTO-2026-09-29.json`. Artefactos originales y logs en `tmp/scraping-pilot-2026-09-29` y en el run citado.

## Comprobación pública

17:15 UTC: portada y categorías CPU/GPU respondieron 200 sin 1102. A las 17:17 UTC las tres guías respondieron 200 y mostraron siete partes con ofertas observadas ≤3 h:

| Guía | Total observado ARS | Tope ARS |
|---|---:|---:|
| 1 millón | 994303 | 1000000 |
| 2 millones | 1954279 | 2000000 |
| 3 millones | 2886249 | 3000000 |

Son cortes de precios previos que seguían elegibles; el nuevo runner no se atribuye haber actualizado siete piezas de cada guía cuando estaban cubiertas. Envío, armado, licencia y periféricos aparte. No se prometen esos importes a futuro.

G02 permanece `en_observacion_produccion`, con tres ciclos diarios útiles registrados y control posible desde 03/10/2026. Aún faltan cobertura, identidad y siete ciclos; esta implementación no satisface por sí sola su cierre. No cambian estado, prioridad, responsable ni fecha del tablero, por lo que se conserva el XLSX sin reescritura.

A las 17:24 UTC, después de publicar `f15655c`, las tres fichas RAM de la muestra fija respondieron 200 sin 1102 y conservaron sus URLs. Esto acredita acceso/render, no aprobación de todas sus ofertas. El seguimiento diario quedó actualizado para leer este informe, separar caché/observación/identidad y conservar el silencio salvo cambios materiales.
