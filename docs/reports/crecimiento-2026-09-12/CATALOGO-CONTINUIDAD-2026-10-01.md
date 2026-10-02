# Continuidad del catálogo — sesión del 01/10/2026

## Estado verificable

**La implementación y sus reparaciones no equivalen a un catálogo totalmente actualizado.** La meta de 95% del subconjunto prioritario observado en 24 horas continúa abierta y necesita siete días reales. Los cortes que siguen cruzan al 02/10 en UTC; en Santiago/Argentina pertenecen a la noche del 01/10.

Corte de Supabase **02/10/2026 01:58:45 UTC**:

| Medida | Resultado |
| --- | ---: |
| Ofertas guardadas en la cola | 71.290 |
| Ofertas prioritarias, intervalo de hasta 24 h | 34.037 |
| Prioritarias observadas dentro de 24 h | 5.736 — 16,85% |
| Todas las ofertas observadas dentro de 24 h | 14.085 |
| Sin intento registrado en la cola adaptativa | 62.232 |
| Altas de Katech obtenidas de fichas HTML | 240 |
| Publicaciones de Katech aún sin oferta guardada | 1.659 |
| Categorías distintas entre producto y cola | 0 |

“Sin intento” se refiere a la cola adaptativa: una oferta puede tener una observación real del inventario sin un intento de esa cola. “Observado” incluye agotados y stock desconocido; no significa comprable ni comparable. Fuente y valores exactos: [evidencia de continuidad](CATALOGO-CONTINUIDAD-EVIDENCIA-2026-10-01.json).

El inicio de esta continuación tenía 183/30.250 prioritarias observadas (0,605%). No comparar ambas tasas como una cohorte fija: hubo altas y correcciones de categoría. No se borraron ofertas para mejorar la tasa ni se renovaron fechas sin consultar una fuente.

## Reparaciones que quedaron aplicadas

- APU con Radeon/Vega integrada y cooler incluido conserva categoría de procesador. La generación DDR compatible no prueba un kit de RAM incluido. Paquetes CPU+RAM/mother conservan el tratamiento de paquete.
- RAM para notebook conserva memoria; PCs/notebooks que encabezan el título se reconocen incluso sin “Core”; CPU/coolers vendidos para PC armada conservan su función. Caché de lectura `catalog-v10`.
- Se incorporaron reglas inequívocas para routers, placas/adaptadores de red, cables, UPS, hubs, impresoras y Stream Deck como periféricos; pasta térmica y thermal pads como refrigeración. Un UPS no se convierte en una fuente interna de PC. La reparación de categorías conserva IDs, referencias, precios, stock, observaciones e historial; también corrige prefijos canónicos y la cola.
- CompraGamer comparte una descarga del catálogo. MaxTecno, Dinobyte y Golden Tech agrupan URLs conocidas usando su API pública, sólo con producto simple, URL exacta, ARS/unidades menores explícitas, centavos y señales de stock coherentes. Un contraste visible por fuente/ejecución rechaza el lote si difiere; esa muestra no verifica individualmente todas las fichas.
- Katech y SCP conservan lectura HTML. Katech mostró $555.318 en API frente a $574.710 visibles; SCP, $933.668,04 frente a $971.756. Que el servidor devuelva 200 no valida esos precios de API.
- Guardado y confirmación tienen reintentos acotados e idempotencia por token. Una respuesta perdida no repite historial, fechas o backoff; tokens ajenos o resultados diferentes se rechazan.
- La preparación de la cola dejó de escribir todas las filas y se dividió en lotes de 500. Las ofertas nuevas se agregan con un trigger privado y los cambios de categoría se sincronizan sin eliminar reservas/backoff. El backfill real completó 5.892 cambios en 19,54 s mediante 13 llamadas. La primera llamada tardó 7,97 s.
- Aun con lotes, el siguiente barrido volvió a fallar antes de leer ofertas conocidas. El plan elegía miles de accesos dispersos cuando casi no quedaban cambios. Se acotó el ajuste del plan a esa RPC privada y se añadieron reintentos/código de timeout. El diagnóstico sobre las mismas tablas pasó de 373.687 accesos de buffers a 12.090, con 230 ms de ejecución de consulta. Son mediciones puntuales: transporte/carga siguen variando y no existe un SLO demostrado.
- El registro de ejecución ahora comienza antes del descubrimiento. Si la preparación falla después, el resumen conserva inventarios, altas de detalle y el código del fallo. Las dos ejecuciones históricas que fallaron antes de crear el registro normal se mantienen como fallidas; sus altas constan en los registros privados de inventario.
- Se releyeron 18 ofertas que habían fallado al guardar: diez se observaron y ocho conservaron su evidencia antigua. El Ryzen 7600X de Compugarden pasó de $38.358.581 a $376.124, con publicación y stock constatados. No se dividieron precios por una heurística.

## Fichas públicas y condición de precio

La verificación en navegador encontró una falla adicional: `/product/cg-5870` redirigía a la ficha canónica del extensor WA850RE, donde se veía únicamente un precio antiguo de Dinobyte ($47.612 de julio). La nueva oferta de CompraGamer existía en la base y en su API, pero no en esa ficha agrupada.

La lectura de detalle ahora reúne las publicaciones de la **misma clave canónica y categoría**, valida identidad/variantes de RAM y GPU, conserva la oferta más reciente de cada URL y mantiene sus fechas, stock, SKU y condición. No usa similitud difusa ni reescribe el historial. Una observación reciente también tiene prioridad sobre un precio histórico barato de otra URL de la misma tienda. Caché de detalle `product-detail-v3`.

El navegador público y la API canónica, **01:57:38 UTC**, mostraron CompraGamer **$28.550** (01:33:24), MaxTecno **$34.909** (00:34:44) y Dinobyte **$37.300** (00:49:57). Se comprobaron las fechas reales y los enlaces a las publicaciones. Dinobyte aparece como registro, sin forzar que sea comparable.

El importador de CompraGamer ahora conserva `precioEspecial` como condición `special`. Se corrigió ese metadato en **308 ofertas nuevas**, con **cero fechas de observación cambiadas**; no se contó como nuevas observaciones ni se inventó otro precio.

## Descubrimiento completo de las fuentes verificadas

El runner confirma un inventario por fuente cada 24 h. Requiere todas las páginas, totales estables, IDs/URLs únicos y hosts configurados. Un inventario incompleto no confirma presencia ni convierte ausencias en agotamiento. Los registros y reservas son privados, con RLS y sin acceso de clientes.

| Fuente | Publicaciones de su inventario diario | Páginas | Altas de ofertas guardadas en esa primera ronda |
| --- | ---: | ---: | ---: |
| CompraGamer | 1.478 | 1 | 254, entre dos cortes de clasificación |
| MaxTecno | 6.057 | 61 | 4.129 |
| Dinobyte | 5.549 | 56 | 4.851 |
| Golden Tech | 1.604 | 17 | 981 |
| Katech | 3.929 | 40 | 0 desde API; 240 desde HTML en cinco lotes |

La primera ronda de esas cuatro fuentes con precio aceptado agregó **10.215 ofertas**. Una relectura manual posterior de CompraGamer, 01:33:17–01:33:39 UTC, verificó 1.482 publicaciones, 1.458 clasificables y agregó otras **54** ofertas. Con los 240 detalles HTML de Katech, esta continuación agregó **10.509 ofertas**. Son ofertas/publicaciones por tienda, no 10.509 modelos físicos distintos. Los cortes de las tiendas no son simultáneos y todos los publicados no son comprables.

CompraGamer pasó de 92 registros sin mapeo a 24. Esos 24 incluyen servicios de armado, dos opciones gratuitas de cooler incluido, tablets/TVs y otros artículos ajenos a la taxonomía actual de PC. Su presencia se conserva; no se fabrica una categoría de componente ni un precio comprable. La última relectura manual no renueva retroactivamente la fecha del inventario diario previo.

Katech usa la API para presencia e identificadores, **nunca sus precios**. Cada ejecución permite hasta 48 fichas visibles/3 minutos y guarda avance; las fallidas quedan pendientes con backoff. Las 1.659 pendientes del corte no están incorporadas todavía. No se reasigna una URL migrada por parecido de título ni se crea otro producto cuando la misma publicación ya está representada.

Los inventarios todavía identifican ofertas históricas ausentes: CompraGamer 2.691, MaxTecno 3.514, Dinobyte 860, Golden Tech 1.299 y Katech 518. Son filas guardadas, no publicaciones únicas. Ausencia en el inventario no demuestra agotamiento, y reconciliar esas referencias conservando identidad/historial sigue pendiente. [Auditoría anterior de MaxTecno/Katech](CATALOGO-INVENTARIOS-2026-10-01.json) es un corte histórico de lectura; no representa el inventario final ni una escritura de precios.

Se contrastaron tres RAM nuevas de MaxTecno en ficha visible: `maxtecno-api-128968` ($293.580), `maxtecno-api-135539` ($547.794) y `maxtecno-api-210` ($263.900), con título, precio y stock iguales al dato guardado a 00:51–00:52 UTC. Esa comprobación no renovó fechas.

## Ejecuciones reales

Los conteos pueden reobservar ofertas: **no sumar ejecuciones como actualizaciones únicas**. `deadline` indica presupuesto de tiempo agotado; GitHub success no acredita cobertura completa.

| Ejecución | Origen | Resultado de aplicación | Intentos | Observadas | Comparables |
| --- | --- | --- | ---: | ---: | ---: |
| 36934215945 | manual | deadline, implementación inicial | 724 | 222 | 77 |
| Piloto local compartido | local | failed, confirmación rechazada | 1.241 | 267 | 242 |
| Piloto local con lotes | local | deadline | 1.587 | 837 | 670 |
| 36939799299 | manual | completed, control visible de API | 240 | 104 | 36 |
| 36941949570, intento 2 | manual | deadline tras reparar preparación | 1.512 | 625 | 256 |
| **36944434298** | **schedule nativo de GitHub** | deadline, GitHub success | 1.687 | 593 | 161 |
| 36946613185 | manual | failed por contraste de Katech; otras altas guardadas | 240 | 88 | 36 |
| 36947809841 | manual | REFRESH_SEED_FAILED antes de crear run normal | — | — | — |
| 36949573013 | manual | REFRESH_SEED_FAILED antes de crear run normal | — | — | — |
| **36950549773** | manual | **completed después del ajuste del plan** | 120 | 32 | 13 |
| **36950993035** | manual | **completed, registro antes del inventario** | 120 | 37 | 19 |
| **36952042156** | manual, capacidad normal 2.500 | **deadline de 17 min, GitHub success** | 1.590 | 435 | 165 |

Los dos lotes pequeños posteriores a la reparación guardaron 48 altas HTML de Katech cada uno. El de 120 intentos más reciente tuvo 73 resultados sin observación y diez fallos de fuente; cero fallos de guardado. El barrido de capacidad normal, 01:40:40–01:57:55 UTC, agregó otras 48 altas HTML, tuvo 1.078 resultados sin observación y 77 fallos de fuente; cero fallos de guardado. Terminó por presupuesto de tiempo, antes de 2.500 intentos. Al finalizar no quedaron reservas de ofertas, inventarios ni detalles, y no había diferencias de categoría entre producto y cola. Esos casos conservan evidencia anterior. No atribuir la falla histórica del piloto local a expiración de lease sin prueba del error original.

## Ejecución autónoma y respaldo

GitHub ejecuta el barrido al minuto 41, hasta 2.500 ofertas/17 minutos, con concurrencia limitada y rotación persistente. Se verificó **una ejecución nativa schedule real**, no solamente el archivo del horario. GitHub puede retrasar o descartar cron bajo carga: [documentación de schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Cloudflare al minuto 11 sólo consulta el estado del workflow y despacha un runner si no hay trabajo activo ni inicio en los últimos 75 minutos. El límite distribuido es un despacho por hora. El scraping sigue en GitHub; no requiere mantener el Mac encendido. El repositorio público usa ejecutores Linux estándar cuyos minutos son gratuitos según [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions); siguen vigentes cuotas de almacenamiento, capacidad de Supabase y límites de las tiendas.

Las ejecuciones reales iniciales de Cloudflare 00:05/00:11 fallaron. Se reprodujo la incompatibilidad de `redirect: error` con el runtime y se sustituyó por `manual`, rechazando redirects/estados incorrectos sin seguir credenciales. El transporte nativo se captura antes de las adaptaciones de Next y se registran códigos propios, sin cuerpos/cabeceras externos. La prueba local posterior llegó a la lectura HTTP esperada; no se confundió con éxito remoto.

El evento programado real de **01:43:41 UTC**, versión `2150d5cc-90c4-49bb-84ff-844b52383914`, terminó **ok**, sin excepciones, con resultado **busy**: leyó GitHub y evitó duplicar el barrido activo. Esto prueba el handler, transporte, autenticación de lectura y control de concurrencia; **no prueba todavía el despacho completo ante ausencia de cron**. Las rutas de límite/despacho conservan pruebas unitarias. La consulta histórica de Observability sigue en 403, pero se obtuvo evidencia mediante tail de eventos programados. Se retiraron ambos horarios puntuales y se confirmó que sólo queda `11 * * * *`.

## Verificación y seguimiento

- Local previo al último test: **1.147 unitarias aprobadas**, dos omisiones existentes, 19 controles operativos, lint/tipos aprobados. El último test se comprobó junto a 27 pruebas focalizadas; CI volvió a ejecutar toda la suite. Pruebas SQL de categorías, historial, límites, permisos, inventarios, paginación y confirmación; dos pruebas de concurrencia aprobadas.
- CI del código final `db9ecb4`, run **36952957142**: aprobado, **1.148 pruebas unitarias**, 19 operativas, migraciones/pruebas SQL y 40 pruebas críticas de navegador. Los commits anteriores `3d83c1b`/`230a4cb` también pasaron CI completo.
- Producción tuvo un 503 de búsqueda durante las altas masivas. Las repeticiones posteriores devolvieron 200; PC i7 tardó 7,74 s. En el corte **01:36:34 UTC**, las ocho rutas de portada/API/categorías/tiendas/búsquedas y la nueva ficha `cg-5870` devolvieron 200 sin 1102; búsquedas APU/RAM-notebook/PC-i7: 1,58/2,02/1,74 s. Ese primer control HTTP no detectó la omisión de ofertas en la ficha canónica: el problema fue encontrado y corregido con verificación de contenido. El código `db9ecb4` tiene build de Cloudflare aprobado `55a3de17-3ef8-4c9a-a7a8-e2c3995492b2` y versión activa al 100% `7fcba70b-17c0-4e5c-aafd-09af3b8fb391` desde 01:53:41 UTC. Se repitieron las ocho rutas a **01:59:16 UTC**, todas 200 sin 1102; búsquedas APU/RAM-notebook/PC-i7: **1,92/2,18/2,54 s**. Son cortes puntuales; no declarar confiabilidad o rendimiento sostenidos.
- Asesores de Supabase: sin nuevos permisos públicos del refresh. Se mantienen los avisos previos de pg_trgm en public y protección de contraseñas filtradas desactivada; las tablas privadas sin política de cliente son denegación deliberada, no una invitación a abrir acceso.
- El seguimiento diario existente consulta este corte, los runs/artefactos y las reservas pendientes, guardando silencio sin cambios materiales. No autoriza desplegar, despachar refresh ni corregir esquema desde el monitor.
- Analytics mantiene la primera importación semanal el **12/10**: siete días completos con tres días de retraso, fechas desde el 03/10 tras exclusión interna, IDs de ficha exactos y agregados anónimos validados. Señales incompletas expiran naturalmente; no reemplazarlas por ceros. Clics de cards/home/búsquedas siguen fuera de atribución por producto.

## Qué falta para cerrar el objetivo

1. Completar la cola legítima de detalles de Katech y reconciliar referencias históricas/migradas con evidencia de identidad.
2. Recuperar o conseguir una fuente permitida para tiendas con 403/429/404 o parseo insuficiente. No eludir controles de acceso ni tomar API discrepante como precio vigente.
3. Medir siete cortes diarios reales, con numerador/denominador y calidad por tienda. No cambiar la muestra, bajar umbrales, borrar filas o sumar jobs manuales como días útiles para simular cumplimiento.
4. Ajustar capacidad/frecuencia a ese rendimiento real y al interés válido de Analytics. La capacidad nominal no demuestra que alcance 95% de 34.037 prioritarias, especialmente con ofertas históricas inaccesibles.

La fase técnica permite descubrir altas, observar y continuar automáticamente; el objetivo operativo de cobertura **permanece abierto**.
