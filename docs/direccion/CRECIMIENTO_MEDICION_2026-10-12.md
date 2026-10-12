# Crecimiento: medición, demanda y promoción de Google Ads

Corte: 12/10/2026. Copia de trabajo: `codex/busqueda-funcional`. La búsqueda pública usa la Mac temporal desde hoy. Tras la autorización de Jonathan se publicaron el acceso de procesadores y los eventos de comparación en el sistema Mac. El lector del panel administrativo conserva su publicación pendiente en el sistema anterior.

## Decisión

Mantener gasto cero. Primero medir comparaciones útiles y aprovechar demanda existente en procesadores. No activar la promoción como si fuera dinero disponible. El objetivo es que una persona encuentre ofertas fiables, compare alternativas y vuelva; los clics agregados no prueban esa secuencia ni una compra.

## Línea base confirmada en las cuentas

GA4, propiedad Comparador Hardware Argentina, 5–11/10/2026: 46 usuarios activos, 55 sesiones, 617 eventos. `search`: 51 eventos / 13 usuarios; `view_item`: 41 / 28; `outbound_store_click`: 18 / 14; `view_search_results`: 9 / 6; `pc_builder_action`: 2 / 1. No sumar el evento genérico `click` con `outbound_store_click`: ambos registraron 18 / 14. Los eventos de búsqueda tienen contratos diferentes; 51 frente a 9 no demuestra pérdida entre etapas. Esta ventana precede la publicación de la búsqueda Mac del 12/10.

El conector oficial GA4 rechazó su autorización por token vencido/revocado. La interfaz web sí permitió leer la propiedad. No importar estas transcripciones como si fueran una lectura API ni convertir el fallo del conector en cero usuarios. Renovar su autorización antes de automatizar informes mediante ese conector.

Search Console, propiedad de prefijo `https://www.comparador-hardware.com.ar/`, Web, 13/09–10/10/2026: 280 clics, 12.119 impresiones, CTR reportado 2,3%, posición media 7,5. No mezclar esta ventana con los siete días de GA4.

- Portada: 195 clics / 2.873 impresiones.
- `/comparar/procesadores`: 10 / 2.531; CTR calculado 0,395%.
- `/guia/pc-gamer-2-millones`: 5 / 282.
- `/guia/pc-gamer-3-millones`: 4 / 216.

Filtrada sólo la landing de procesadores: `comparar procesadores` 4 / 951, `comparador de procesadores` 0 / 269, `comparar cpu` 0 / 124, `comparar procesadores pc` 1 / 96, `procesadores vs` 1 / 14. Son una muestra de 85 consultas visibles para esa página, no el total ni una prueba definitiva de intención. Sugieren interés en contrastar modelos. El título actual ya menciona precios AMD e Intel; no conviene atribuir el CTR bajo exclusivamente al título.

## Cambios revisados y alcance de publicación

1. Lector GA4: validar encabezados, zona horaria, metadatos de privacidad/muestreo/truncamiento y coherencia de `rowCount`/filas/límite. Informes incompletos conservan la última lectura válida con su fecha. El top de ocho canales permite filas adicionales; informes de eventos y días exigen completitud. Un informe vacío válido puede acreditar cero; un fallo no.
2. `comparison_result`: pareja resuelta con dos IDs distintos, categoría y uso válidos, consentimiento activo y GA4 disponible. Deduplicar por navegación, pareja completa y uso. Registrar cuántas tiendas tienen ofertas elegibles de tres horas y si existe evidencia suficiente para la recomendación por precio; una comparación sin ese respaldo puede resolver información, pero no acredita oferta comprable ni venta.
3. `comparison_product_open`: sólo el clic explícito en la ficha A/B, deduplicado por pareja/uso/lado. No emitir por render ni prefetch ni recuperar clics anteriores al consentimiento.
4. IDs de catálogo válidos hasta 200 caracteres siguen siendo medibles. Omitir sólo parámetros de ID mayores de 100 caracteres del payload GA4; conservar IDs completos en deduplicación. No truncar ni mezclar identidades. Para esas filas no será posible un desglose GA4 por ID mediante ese parámetro.
5. Landing CPU: acceso visible a `/comparativa/comparar`, explicando comparación técnica, costo de plataforma y límites de evidencia. Mantener el título, canonical y reglas de indexación existentes. No agregar promesas de FPS.

El nuevo lector afecta el panel del Worker original; no queda activado publicando sólo la Mac. Separar su integración de la publicación acotada de eventos y landing de CPU. Preservar las rutas y versiones actualmente en producción; no desplegar toda esta rama sobre el Worker original para entregar este cambio.

## Oferta de Google Ads leída y confirmada por Jonathan

La cuenta muestra USD 350, no un saldo de 350.000 pesos. Jonathan confirmó que es esa promoción. Los [términos específicos](https://ads.google.com/home/terms-and-conditions/incentives/?bid=6653296821&bc=CL), leídos en la página oficial, exigen anunciantes nuevos con dirección de facturación en Chile, perfil de pagos y método válido. Para obtener el crédito hay que acumular al menos USD 350 en costos publicitarios dentro de 60 días, sin impuestos/tasas; ingresar un pago sin consumo no alcanza. El crédito suele aplicarse hasta 35 días después de cumplir las condiciones y vence 60 días después de aplicarse. No cubre impuestos ni el gasto previo; al agotarse pueden continuar cargos hasta detener campañas. La moneda de facturación y la elegibilidad final no están comprobadas. No se agregó medio de pago ni se avanzó el registro.

La [ayuda oficial sobre promociones](https://support.google.com/google-ads/answer/6388096?hl=es) distingue aplicación de oferta, requisitos y crédito activo. La oferta no elimina la necesidad de financiar la inversión inicial. Recomendación: no activarla bajo el límite actual de gasto cero.

## Borrador de una prueba paga futura — no cargado en Ads

Sólo si Jonathan aprueba un importe propio y moneda concretos, impuestos y duración: una campaña de Búsqueda dirigida a personas presentes en Argentina, español, con landing `/comparar/procesadores`. Empezar con concordancia exacta o de frase para intención de precios: `comparar precios procesadores`, `precios procesadores argentina`, `comparador precios cpu`. Revisar negativos para búsquedas de reparación, drivers, empleo o descargas. No excluir términos a ciegas que puedan describir una búsqueda válida.

Texto candidato: “Compará Precios de CPU”, “AMD e Intel en Argentina”, “Elegí y Compará Dos Modelos”. Descripción: “Buscá procesadores y contrastá ofertas de tiendas argentinas. Confirmá stock y pago en cada tienda.” No afirmar mejor precio garantizado, disponibilidad total ni venta propia.

No fijar CPC, CAC, ROI ni presupuesto ficticios. El objetivo observable sería comparación A/B y clic posterior a una tienda, medidos por usuario/sesión consentidos; no optimizar como compras. Probar recepción y deduplicación antes de importar acciones a Ads. Presupuesto diario no sustituye límite total y revisión de gasto. Este borrador no autoriza campaña, facturación ni aceptación de condiciones.

## Próximas prioridades y aceptación

1. Publicación de medición/landing ejecutada y comprobada en dominio público. Separar pruebas internas de la línea base de usuarios. Los envíos a Google fueron aceptados; la comprobación de eventos procesados de visitantes externos conserva estado pendiente, porque las pruebas propias se excluyen.
2. Observar CPU durante una ventana comparable posterior a publicación: impresiones, clics, CTR y consultas con los mismos filtros, además de llegada al comparador y resultados útiles. Un cambio sin muestra suficiente queda inconcluso; no adjudicar crecimiento sólo por cambiar el título.
3. Prueba de utilidad de costo cero: cinco personas comparan y cinco arman una PC. Jonathan convoca; el agente no contactó terceros. Tiempo máximo sugerido 14 días / seis horas de trabajo. Registrar si completan sin ayuda y errores de identidad, precios o total. Cuatro de cinco por recorrido es un criterio operativo propuesto, no evidencia ya obtenida.
4. Medir retorno D7 con una cohorte y tiempo transcurrido reales. Dos retornos en diez personas serían una señal inicial, no una tasa generalizable. Si no se ejecuta la prueba, registrar no ejecutada; QA del agente no equivale a usuarios externos.

## Evidencia y límites

En `outputs/crecimiento-2026-10-12/`: capturas GA4, captura de términos Ads, resultados GSC filtrados, `public-seo.json`, compilación aislada, tests y recibos de navegador local. Diez rutas públicas entregaron HTTP 200; las páginas HTML inspeccionadas incluían configuración GA4. `/search` permanece noindex intencionalmente; la landing CPU tiene canonical e indexación. HTTP 200 y configuración de GA4 no prueban por sí solos recepción de eventos ni Core Web Vitals. La inspección no acredita cobertura fresca de todo el catálogo ni elimina la dependencia temporal de la Mac.

Verificación local completada: 169 tests de analíticas, medición y comparación, compilación aislada, TypeScript y ESLint aprobados. Revisión independiente sin bloqueos materiales. Navegador real: comparación resuelta antes del consentimiento produjo cero eventos; aceptar tarde produjo un único resultado. Abrir A y B produjo un evento explícito por lado. Volver al comparador recuperó la selección y produjo un resultado de la nueva navegación, sin duplicados dentro de ella. Una alternativa sin oferta elegible conservó el gate de precio en falso. El receptor de prueba reemplazó el SDK remoto de Google sólo en la copia local: esos recibos no acreditan recepción GA4 ni contaminan su línea base. El primer error del harness se corrigió al evitar alterar la longitud del texto serializado de React. Landing CPU comprobada en escritorio y móvil. No se reinició el servicio público, desplegó, modificó facturación ni activó campaña.

La frase anterior describe la preparación local. La autorización posterior del 12/10 habilitó la publicación acotada, ejecutada a las 18:45 de Santiago: release `growth-6473a15`, build `Yzo80n2ijamfseK8A7CQK`, Worker de catálogo versión `c8a57b14-ac18-474b-9ddf-036612ee2bae`. Se conservaron assets anteriores. Las 14 rutas mantuvieron patrones y Worker destino; Wrangler regeneró sus IDs. El despliegue del Worker original `5b77fc37-9fea-48df-aca5-e1c43956f0a6` quedó intacto. Runtime y release anterior guardados para rollback. Nueve rutas públicas y los chunks de comparación entregaron 200; la duración registrada para comparación incluye revisar todos sus scripts y no es latencia de una sola página.

Los dos resultados observados corresponden a dos navegaciones propias; las dos aperturas a A/B fueron explícitas. El navegador envió los eventos reales `comparison_result` y `comparison_product_open` al ID `G-7BHXTCQFTP`; Google respondió 204. Payload contrastado: categoría procesadores, uso gaming, IDs completos, una oferta elegible de tres horas en A y cero en B, gate de precio falso. Tag Assistant oficial confirmó llamada y hit. Su aviso de CSP sobre un recurso diagnóstico no motivó debilitar las restricciones. No crear eventos sintéticos por Measurement Protocol ni desactivar filtros para conseguir un gráfico verde.

En la propiedad GA4 `553934279` el flujo `15766410122` usa el mismo ID. El filtro `Internal Traffic` está activo para excluir `traffic_type=internal`; la regla “Red de Jonathan - IP actual” coincide con la IP actual, contrastada sin guardar ni publicar el valor. Esto explica que las pruebas propias no se procesen en los informes. Jonathan confirmó excluir nuestras visitas. La preferencia del navegador de trabajo quedó en rechazar analítica al terminar y Tag Assistant quedó sin dominio activo. No acreditar recepción procesada de usuarios externos por el 204 o por el historial de tráfico del flujo. El conector API GA4 sigue vencido; no se ampliaron permisos. El ciclo automático del catálogo posterior a la publicación terminó 18:55:48 Santiago con promoción y ACK del nuevo proceso, cero filas D1 y tres requests de captura; observó cero ofertas nuevas en ese tick.

## Seguimiento en Excel y Semrush

Jonathan pidió registrar el seguimiento en Excel, incluyendo Search Console y el correo Semrush. Fuente Semrush: campaña `www.comparador-hardware.com.ar`, Google Argentina/español latinoamericano; dispositivo no informado en el correo. Informes recibidos: 23–30/09 visibilidad 25,31%, estimación de tráfico 7,93; 30/09–07/10 visibilidad 13,37%, estimación 3,09. La caída de visibilidad calculada es 11,94 puntos porcentuales; “comparar CPU” pasó de 1 a 11 y “comparar componentes PC” de 1 a 8. No atribuirlo al despliegue posterior del 12/10 ni confundirlo con caída de visitantes medida.

El correo recibido el 12/10 a las 18:05 Santiago declara período 07–14/10, muestra 13,37% y 3,09 sin cambio. Su fin de ventana es posterior a la recepción: mantener provisional hasta conciliar con el reporte. La estimación de tráfico de Semrush no se suma a sesiones GA4 ni a clics Search Console. Registrar fuentes, ventanas, fechas de extracción, estado y exclusión de pruebas; preservar el historial y dejar lecturas faltantes pendientes, sin inventar cero o deltas entre períodos incompatibles.

Jonathan confirmó actualizar el Excel los lunes a las 10:00 de Santiago, dentro del seguimiento existente y preservando sus controles operativos diarios. El protocolo está en [SEGUIMIENTO_EXCEL.md](SEGUIMIENTO_EXCEL.md); el archivo guarda las lecturas iniciales y una tabla de historial ampliable.
