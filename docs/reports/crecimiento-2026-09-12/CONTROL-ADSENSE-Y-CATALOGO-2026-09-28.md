# Control de preparación AdSense y catálogo — 28/09/2026

Corte documental 13:36 UTC. Se conservan por separado los horarios del scheduler y del render. No hubo refresh manual, lectura de credenciales, cambios de cuenta o activación de anuncios en este control.

## Presupuesto de $2 millones

La selección rearmada comprobada a las 00:43 UTC sumó ARS 1.934.428, con siete piezas. Es un corte histórico. La lectura pública de las 13:32 UTC respondió 200 en móvil 390×844, sin errores JavaScript ni desbordamiento, pero mostró **1/7 piezas y subtotal incompleto ARS 123.918**. Solo la fuente ADATA XPG Kyber 650W tenía oferta elegible; la página indica seis partes pendientes y ofrece comprobar siete publicaciones. No se accionó ese botón.

Esto impide presentar el importe de anoche como presupuesto completo vigente. La página excluye las filas sin oferta, pero una selección completa que caduca sin nueva cobertura todavía no satisface la utilidad de una guía de compra. No se amplió artificialmente la ventana de tres horas ni se rejuvenecieron fechas sin observar tiendas. Evidencia privada: `cortes/2026-09-28/adsense-preparation/GUIA-2M-PUBLICA.json` y `guia-2m-movil.png`.

La guía lee el catálogo; no encola las siete piezas por visitarla. Su botón usa publicaciones conocidas. El cron atiende una demanda por día (`maxQueries=1`), que puede generar varias ofertas pero no equivale a renovar la selección completa. Corresponde evaluar cobertura y costo de las comprobaciones a pedido, incluidas alternativas de la misma pieza cuando una tienda no la ofrece. No se declara que las seis piezas estén agotadas: faltan ofertas recientes elegibles en el comparador.

## Ejecución diaria y frescura

Fuente: [ejecución programada 36416720473](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36416720473), creada 11:37:07 UTC, estado completed/success; artefacto `catalog-freshness-36416720473`, corte 11:37:48.936 UTC. Archivo original preservado localmente en `cortes/2026-09-28/catalog-freshness-36416720473.json`.

| Alcance medido | Valor |
|---|---:|
| Filas de ofertas actualizadas durante el ciclo | 1 |
| Productos distintos actualizados | 1 |
| Tienda con observación | shopgamer: 1 fila |
| Denominador de ofertas almacenadas con precio positivo/stock disponible | 47.610 |
| Ofertas disponibles observadas ≤24 h | 16 / 47.610 |
| Ofertas disponibles observadas ≤3 h | 0 / 47.610 |
| Muestra fija: disponibles observadas ≤24 h | 1 / 60 |
| Muestra fija: disponibles observadas ≤3 h | 0 / 60 |

`observedRows` de este artefacto incluye cualquier estado de stock/precio, mientras los contadores de frescura exigen disponibilidad y precio positivo. Shopgamer no aparece en las tiendas con ofertas disponibles. La combinación de una fila actualizada y cero ofertas frescas disponibles es compatible con una observación sin stock o sin precio utilizable; el JSON no conserva cuál. No atribuir un motivo exacto ni inventar nuevos campos retroactivamente.

Se registra como ciclo medido con calidad pendiente, sin promoverlo a un tercer ciclo útil de precios comprables. Los dos controles diarios anteriores permanecen en el histórico; G02 sigue abierto y su muestra fija no está validada. La ausencia de ofertas elegibles no demuestra fallo de red ni error de scraping. Un workflow verde prueba ejecución, no cobertura suficiente.

## Mejora aplicada al informe

`scripts/catalog-freshness-report.mjs` conserva `observedRows`, `persistedProducts`, `observedByStore` y numeradores/denominadores existentes. Añade productos distintos por tienda y filas observadas con precio positivo/stock disponible, separadas globalmente y por tienda. El resumen incluye también tiendas actualizadas sin ofertas disponibles, antes ausentes de la tabla. Define que las filas son estado persistido, no cantidad de observaciones sucesivas de una misma URL.

La mejora no acredita identidad completa, compra, estado en la tienda al pulsar el enlace ni recepción del pipeline. El próximo artefacto podrá distinguir estos alcances; el artefacto de hoy conserva su esquema original y sus valores no verificados. Un conteo exacto ausente ahora detiene el informe en lugar de presentarse como cero. No se altera el scraping, la frecuencia del cron, la frescura, permisos o credenciales.

Validación proporcional: cinco tests aprobados. Tres verifican conteo entre páginas/productos/tiendas, exclusión de stock desconocido/agotado y precio inválido, corte vacío y entradas malformadas. Dos ejecutan el CLI contra un servidor local de fixture: comprueban campos y tabla para una tienda sin oferta disponible, y fallo explícito ante conteo exacto ausente. Sintaxis del script y ESLint aprobados. No se ejecutó una consulta a Supabase real para fabricar un nuevo ciclo ni se disparó el scheduler. La publicación se registrará tras subir el cambio; no se afirma que el informe de hoy ya incorpore los campos nuevos.

Implementación versionada en `3405025`. La ejecución diaria observada usó `99531b0`, anterior a esta mejora. Su próxima ejecución deberá conservar los nuevos campos para confirmar funcionamiento con datos reales; las pruebas de fixture no sustituyen ese control.

## AdSense

[Decisión técnica CSP y consentimiento](ADSENSE-CSP-Y-CONSENTIMIENTO-2026-09-28.md): se corrigió el plan de lista fija de dominios a diseño con nonce según Google. El control público previo no encontró fallo CSP en la comparativa; no se modificó la política vigente por inferencia. La integración del proveedor sigue pendiente y apagada.

Se separaron preparación/solicitud G23/G24 de pruebas con anuncios reales G25 después de aprobación. No equivale a cerrar G23: faltan diseño revisado y cargador/consentimiento probados. G18, G19, G20, G21 y confiabilidad mantienen sus controles humanos, externos o técnicos. Jev no estuvo disponible y no se simuló una respuesta. G01 no se cierra por una guía 200 ni G02 por el cron verde. No hay solicitud de revisión enviada.
