# Validación del corte 12/09/2026

Se conservó el árbol local existente. La unidad de implementación se publicó y se validó por rutas públicas; las herramientas de tests pueden regenerar carpetas ignoradas de build y resultados.

| Comprobación | Resultado | Límite |
|---|---|---|
| Unitarios focalizados de esta unidad | 8 archivos; 54 aprobados | Cubren catálogo, disponibilidad, sitemap, métricas y estado de categoría; no comprueban producción |
| Lint | Aprobado | Análisis estático |
| TypeScript y diff | Aprobados | Sin errores estáticos ni espacios inválidos en el diff |
| Build Next | Aprobado tras los cambios | Configuración local Redis inválida e historial Supabase con Invalid API key; funciona con degradación |
| Revisión visual y pública | Contacto, disclosure y navegación de información visibles; dos enlaces de correo publicados | Falta comprobar recepción real del correo comercial |
| E2E focalizado anterior | 18 ejecutados; 13 aprobados; 5 fallidos; 2,1 min | Home, navegación de búsqueda y móvil; sin scraping real |
| Dependencias | Cuatro entradas: tres altas y una moderada | Relaciones transitivas; exposición por evaluar |
| Producción | Portada, categorías, búsqueda, ficha y sitemaps con 200 en muestras posteriores | Muestra puntual, no porcentaje de disponibilidad |
| OpenNext desplegable | Aprobado y publicado | La configuración local de Redis sigue degradada durante el build |

## Cinco E2E fallidos

1. `e2e/home-page.spec.ts:60`: selector Procesadores coincide con tres enlaces; además espera URL antigua `/search?category=procesadores`. Los enlaces observados apuntan a `/comparar/procesadores`. Corregir alcance del selector y contrato de ruta.
2. `e2e/home-page.spec.ts:89`: busca enlace COMO FUNCIONA que no está presente. Decidir si volver a hacer visible esa entrada o comprobar Acerca desde el lugar donde existe; no quitar la cobertura de información/confianza.
3. `e2e/home-page.spec.ts:97`: la declaración de independencia existe dos veces y el selector no es único. No significa ausencia del disclosure.
4. `e2e/mobile-responsive.spec.ts:28`: cuenta enlaces con `category=`, pero las categorías usan rutas limpias. Actualizar contrato sin volver a introducir URLs antiguas.
5. `e2e/mobile-responsive.spec.ts:54`: busca heading FILTROS; el snapshot tiene texto genérico FILTROS. Revisar semántica/accesibilidad y comprobar realmente que los filtros se pueden abrir y usar.

Los cinco contratos se actualizaron en el árbol local: rutas limpias de categorías, alcance de selector, enlace visible a Acerca, disclosure no ambiguo y encabezado semántico de filtros. Falta una ejecución E2E completa con resultado persistido para cerrarlos. Los resultados no prueban cinco fallos de navegación reales, ni permiten declarar la UI completa aprobada.

## Inicio de implementación local

- El scheduler diario deja de ejecutar el barrido `full`: ejecuta `hot` con hasta ocho objetivos stale/prioritarios. Si no puede consultar objetivos tracked/hot, ahora termina sin iniciar categorías completas.
- El refresh lanzado desde una visita pública queda opt-in mediante `ENABLE_INTERNAL_BACKGROUND_REFRESH=1`. El cron autenticado y las ejecuciones manuales siguen disponibles.
- Pageviews GA4 se emiten tras cargar GA4 y en cada cambio de ruta; el contacto comercial registra solo intención, tipo y canal, nunca el correo del visitante.
- Se creó la cuenta, propiedad y flujo web de GA4 para `www.comparador-hardware.com.ar`. La medición mejorada quedó activa; su identificador público se incorporó al build y a la configuración del Worker sin registrar valores sensibles en este documento.
- La tanda de accesibilidad y rendimiento de la auditoría Impeccable quedó publicada: contraste AA de CTA oscuro, buscador táctil de 44 px, filtros y menú con estados programáticos, movimiento reducido inmediato y menor costo visual de portada. La evidencia y los límites están en `IMPECCABLE_AUDIT.md`.
- Ofertas agotadas ya no contribuyen a schema de producto, cantidad de tiendas de la ficha ni elegibilidad del sitemap.
- La landing editorial de categoría deja de persistir tras una búsqueda, filtro, orden o paginación en el cliente.
- Contacto explica el piloto patrocinado, independencia del orden orgánico y usa el correo comercial configurado para propuestas y reportes. Falta comprobar su recepción real antes de contar leads.

## Pendiente antes de cierre de esta unidad

1. Confirmar en registros Cloudflare que el cron reducido termina y registrar siete ciclos útiles antes de volver a ampliar alcance.
2. Esperar la recepción inicial de GA4 (Google informa hasta 48 horas) y validar un `page_view`, una navegación y un `generate_lead` de prueba sin datos personales.
3. Probar la recepción del correo comercial antes de contar leads o contactar posibles sponsors.

## Publicación y verificación inicial

- Se publicó la versión `c9b8508d-beff-4428-9430-f895c7d21054` y el despliegue inicial confirmó que el error no estaba resuelto: `/comparar/procesadores` devolvió 503/1102. El log de Cloudflare registró `exceededCpu` y el límite de 10 ms.
- La causa encontrada fue el render inicial: leía y transformaba hasta 1.000 productos para mostrar 12. Se sustituyó la landing de categoría por una lectura paginada de 12 productos agrupados y un conteo de base de datos.
- Se publicó la corrección como versión `2df0aa89-65c5-4885-ae63-6d4bbbc1d81e`. Una solicitud sin cache a CPU respondió 200 en 2.564 ms, GPU en 413 ms, búsqueda Ryzen 5 5600 en 952 ms y portada en 755 ms, sin 1102.
- La revisión visual pública confirmó la landing CPU, filtros, resultados y paginación. Es una muestra inicial; G01 queda en observación hasta comprobar estabilidad sostenida.
- El refresh manual con ocho objetivos alcanzó 503/1102 después de 1 minuto y 50 segundos. Se reduce el scheduler a un solo objetivo por ejecución mientras se mide el costo y se rediseña la coordinación de scraping fuera del request del Worker.
- Se corrigió la clave pública de Supabase del Worker y el primer ciclo limitado terminó con `source=hot-db`, un objetivo, 200, cero fallos y 12 segundos. La respuesta registró el objetivo `memoria-ram` con cero productos: es una ejecución sana, pero todavía no prueba que la frescura y cobertura sean suficientes.
- El acceso administrativo de Supabase confirmó que el proyecto `argen-prices-db` está activo. Se reemplazó en local y en el Worker la clave secreta de servidor que devolvía `Invalid API key`; la clave pública y la secreta verifican ahora lectura de `products` con 200. Una ejecución manual posterior (`34702137652`) terminó en 15 segundos con `source=hot-db`, un objetivo, 200 y cero fallos. Aún debe verificarse que los siguientes ciclos persistan precios útiles.
- La medición directa mostró 46.614 productos, 60.959 precios, 1.814 productos `hot` vencidos y ningún precio actualizado en siete días. Un refresh dentro del Worker para `Ryzen 5 5600` agotó sus dos ventanas de 90 segundos y falló con 504. Se trasladó el scraping diario a un runtime local de GitHub Actions con secretos del repositorio; la misma búsqueda terminó allí en 28 segundos, devolvió dos productos y dejó 18 precios actualizados en Supabase (`34705289877`). El ciclo diario rota 12 consultas de intención de compra en vez de insistir sobre títulos discontinuados.
- El sitemap dejó de cargar el catálogo completo antes de paginar. Dos funciones de Supabase ahora resuelven elegibilidad, deduplicación canónica, conteo y páginas; se mantienen los criterios de dos comercios disponibles y orden estable. La versión pública `88882e9a-3a06-430b-85db-00fdfc44a057` respondió el índice en 2.466 ms con seis sitemaps, la primera página con 1.000 URLs y la última con 794, sin 1102. El tamaño de página se fijó en 1.000 por el límite de respuestas de Supabase.
- Se creó y configuró la propiedad GA4 autorizada para el sitio. La versión pública `7d20dfa4-fe32-40e2-a824-36fe93093ee3` devuelve 200 e incluye el cargador de Google y el identificador de medición esperado; la política CSP permite los dominios de Google Analytics. La confirmación de eventos en informes queda pendiente de la ventana de recepción indicada por Google.
- El muestreo previo sin cache registró portada 200 en 3.350 ms, CPU 200 en 2.306 ms, búsqueda Ryzen 5 5600 200 en 2.127 ms y contacto 200 en 176 ms, todos sin 1102. El índice anterior tardó 13.712 ms; la medición posterior a la optimización se registra arriba.

## Próxima prueba de aceptación

Después del arreglo de infraestructura: abrir portada, CPU, GPU y ficha desde desktop/móvil; buscar una consulta conocida y otra sin resultados; cambiar filtro y orden; verificar oferta/stock/fecha y destino; validar contacto y eventos sin enviar mensajes a negocios. Ejecutar matriz de tiendas y pruebas de roles en entorno apropiado antes de afirmar revisión integral cerrada.

## Seguimiento 13/09/2026

Muestra pública espaciada: portada, CPU, GPU y una ficha agrupada conocida devolvieron 200. El workflow `34751070154` terminó con 200, un objetivo de demanda pública, 11 productos y cero fallos. Confirma recuperación y la ruta de demanda, pero no acredita todavía disponibilidad sostenida, siete ciclos útiles ni frescura agregada por tienda.

## Seguimiento 14/09/2026

La misma muestra pública devolvió 200 en las cuatro rutas. El workflow `34833586162` procesó una demanda pública, devolvió cinco productos y no reportó fallos. Es continuidad sana, sin evidencia suficiente para cerrar la observación de disponibilidad ni de frescura.

## Seguimiento 19/09/2026

Portada, CPU, GPU y ficha conocida devolvieron 200. El scheduler completó siete días consecutivos sin fallos: seis ciclos encontraron entre 2 y 12 productos y el séptimo encontró cero para `rx 6600 xt`. La ausencia de fallos es una mejora sostenida frente al incidente inicial, pero un ciclo verde con cero productos no cuenta como actualización útil; faltan frescura por tienda y evidencia de precios persistidos para cerrar G02.

## Seguimiento 20/09/2026

La muestra pública se mantuvo en 4/4 respuestas 200. La ejecución programada `35503079842` también terminó sin fallos, pero repitió `rx 6600 xt` por segundo día y volvió a devolver cero productos. La salud HTTP continúa estable; la nueva evidencia operativa es que la cola de demanda puede quedar fijada en una consulta vacía. G02 no puede cerrarse hasta comprobar consumo o rotación de ese objetivo y resultados útiles en ciclos posteriores.

## Seguimiento 21/09/2026

La muestra pública continuó en 4/4 respuestas 200. La ejecución `35589635629` rotó a `rx 6950 xt`, descartando por ahora que la cola permanezca fijada en `rx 6600 xt`; aun así, obtuvo cero productos. Son tres ciclos consecutivos sin resultado útil. La estabilidad de ejecución no cambia, pero G02 sigue abierto hasta explicar los ceros y volver a observar precios persistidos.

### Search Console y GA4 — 21/09/2026

Search Console confirmó una ventana completa de 28 días contra los 28 anteriores: 296 vs 192 clics, 14 mil vs 9,55 mil impresiones, CTR 2,1 % vs 2,0 % y posición media 8,4 vs 8,5. La interfaz también mostró 3.187 páginas indexadas, 326 no indexadas y primeros resultados enriquecidos válidos: dos fragmentos de producto, una ficha de comerciante y dos breadcrumbs.

GA4 quedó verificado después de guardar todas las comunicaciones opcionales desmarcadas: 143 usuarios activos, 512 eventos y 178 `page_view` para 24/08–20/09. Search Console no está asociado a GA4; esto limita la integración entre informes, pero no invalida los datos comprobados en GA4.

Jev se usó como segunda opinión con contexto mínimo. Priorizó CPU con 91 % y confianza 0,87, y dio 14 % a cambiar snippets de inmediato. La preparación comercial obtuvo confianza 0,09, por lo que ese juicio no se utiliza. No autorizó ni produjo cambios externos.

### GA4, avisos GSC y recuperación de guías — 21/09/2026

GA4 quedó accesible tras guardar todas las comunicaciones opcionales desmarcadas. Para 24/08–20/09 muestra 143 usuarios activos, 512 eventos, 178 `page_view`, 18 `click`, 7 `form_start`, 19 `user_engagement` y 4 `scroll`. No aparece `generate_lead`. G03 queda comprobado; G07 sigue abierto porque falta distinguir clics de tienda y conservar sus dimensiones.

El mensaje de Search Console del 16/09 identificó un `Error de servidor (5xx)` para `/guia/pc-gamer-2-millones`, con primer registro el 15/09 y rastreo del 18/09. La prueba del 21/09 reprodujo 503/1102 en las tres guías de presupuesto. El código cargaba hasta 8.400 filas de catálogo durante cada render.

El commit `158a580` acotó la lectura a 24 productos agrupados y comprables por cada una de siete categorías. Verificación previa: 16 pruebas unitarias, lint focalizado, build completo y tres guías locales en 200. La versión pública `921e0f4b-1d01-4493-82b4-fa2c5359bc7b` dejó las tres guías en 200; CPU continuó en 200. Search Console confirmó `Resultado de la validación: iniciada` el 21/09 para `/guia/pc-gamer-2-millones`. La incidencia sigue abierta hasta que Google vuelva a rastrear y comunique el resultado final.

### Auditoría completa de Search Console — 21/09/2026

La prueba en tiempo real de `/guia/pc-gamer-2-millones` mostró que la URL está disponible para Google y se puede indexar. El índice aún conserva el rastreo del 20/09 con 5xx, por lo que G01 sigue en observación y la validación permanece iniciada.

Sitemap: correcto, 29 páginas descubiertas, última lectura 15/09. HTTPS: 31 válidas y cero no HTTPS. Retiradas: ninguna solicitud en las tres categorías durante seis meses. Seguridad: sin acciones manuales ni problemas detectados. Core Web Vitals: sin datos CrUX suficientes en móvil y escritorio.

Resultados enriquecidos: dos fragmentos de producto, una ficha de comerciante y dos breadcrumbs válidos. Quedan mejoras opcionales de reseñas y campos Merchant de envío, devoluciones y SKU; no se completarán con datos inventados. Google detecta 662 oportunidades de producto, que no equivalen a ventas ni audiencia.

Rastreo: aproximadamente 16 mil solicitudes en 90 días, 97 % con 200 y 373 ms de respuesta media. El host conserva la señal histórica de conectividad elevada de la semana anterior. `robots.txt` fue obtenido y su única advertencia era la directiva `Host` ignorada en la línea 13. El commit `d75a981` la eliminó; prueba, lint y build pasaron, y la versión Cloudflare `c00c30a7-e659-46f1-93f0-80b528a8da89` devolvió el archivo público en 200 sin esa directiva.

Enlaces: dos externos y 7.751 internos, concentrados en URLs legacy de categorías y páginas institucionales. Asociación: Search Console no está vinculado con GA4. IA generativa: control heredado en `Incluir`. Estos hallazgos abren G17 y no cierran G01, G02 ni G07.

### Registro de decisión Jev — 21/09/2026

Opciones evaluadas: instrumentación del embudo y CTA; enlaces internos/rich results; asociación GA4–Search Console; Merchant Center; preparación o contacto con sponsors. Resultado principal: embudo/CTA 64 %, confianza 0,56. Segunda prioridad: enlaces/rich results 39 % frente a asociación GA4 32 %, confianza 0,23. Activar Merchant ahora: 6 % a favor. Contactar sponsors ahora: 26 % a favor. Confianza global: 1,52/4, entre baja y media.

Contraste: la recomendación principal coincide con la ausencia de dimensiones por tienda y `generate_lead`. La segunda prioridad queda compartida entre G17 y la asociación GA4 porque la diferencia y la confianza son bajas. Jev es asesoría y no autoriza activaciones externas, mensajes comerciales ni cierres de tareas.

### Corte de implementación G07 — 21/09/2026

El código ya emite `generate_pc_budget`, `select_advisory_cta`, `generate_lead` y `outbound_store_click` en el recorrido de armador, guías, fichas, contacto y salidas de las guías. Los eventos se probaron mediante tests unitarios y el recorrido se verificó localmente en `/guia/armar?pesos=1500000` y `/contacto#asesoria-pc`. `npm run lint` y `npm run build` finalizaron sin errores.

Estado de evidencia: implementación publicada en Cloudflare como versión `b9375fe3-3403-4c18-8edb-21edff29fbb5`. `/contacto` y `/guia/armar?pesos=1500000` respondieron 200 y mostraron el CTA en el HTML público. La aparición de eventos en GA4 todavía no está verificada. Un clic de correo representa intención de contacto, no confirma que el mensaje haya sido enviado ni recibido. No se registran datos personales en los parámetros nuevos.

### Corte operativo — 22/09/2026

Las cuatro rutas diarias respondieron 200. El scheduler `35712677571` devolvió `fallbackApplied=true`: `rx 6950 xt` produjo cero artículos y la consulta de recuperación `ryzen 5600` obtuvo dos. La ejecución manual fallida `35678031730` fue una prueba acotada a Mexx, Venex y Maximus; las dos ejecuciones manuales posteriores por categoría fueron exitosas. La recuperación está comprobada, pero no cierra G02 ni prueba frescura completa del catálogo.

### Corte operativo — 23/09/2026

Las cuatro rutas críticas respondieron 200. El scheduler `35845459548` finalizó con `fallbackApplied=true`: `rx 6600 xt` devolvió cero artículos y `rtx 5060` informó 12, con un objetivo correcto y uno vacío. No se modificó el estado de G02: faltan mediciones de persistencia, cobertura y frescura por tienda.

### Corte operativo — 25/09/2026

Las cuatro rutas críticas respondieron 200. Los jobs `35983951557` y `36122266839` informaron 12 productos cada uno para `procesadores`, `fallbackApplied=false` y `failedTargets=0`. Se verificó continuidad técnica; persistencia de precios y frescura por tienda siguen sin comprobación suficiente para cerrar G02.

### Search Console autenticado — 25/09/2026

Se leyó el aviso de validación del 23/09: una URL con 5xx corregida; el informe del motivo muestra 0 afectadas y validación correcta. Se leyó el aviso del 24/09: el dataset del índice de precios es válido y solo carece del campo opcional `license`. Fragmentos de productos muestra 6 válidos y 3 no válidos por ausencia de `offers`, `review` o `aggregateRating`; los tres ejemplos son fichas sin oferta válida en el marcado actual. Fichas de comerciantes muestra 3 válidas y 0 inválidas, con advertencias de SKU y políticas de tiendas. Oportunidades para comercios muestra 671 productos; no se trata de un informe de anuncios ni confirma ventas. No se inició ninguna validación nueva ni configuración comercial.

### Corrección local de JSON-LD — 25/09/2026

`Product` ahora se emite solo con `AggregateOffer` basado en ofertas recientes, disponibles y válidas. Sin ofertas, permanecen los datos estructurados de breadcrumbs y organización. El SKU se omite cuando el valor verificado de especificaciones contiene espacios; el MPN se conserva. Se probaron los casos de oferta vigente, precio/URL inválidos, antigüedad, agotamiento y SKU con espacios. `npx vitest run src/lib/product/product-page-metadata.test.ts`: 22/22; ESLint focalizado, `npx tsc --noEmit` y `npm run build`: correctos. La verificación pública y el nuevo rastreo de Google se registrarán por separado.

El cambio se envió a `main` en `310627c`. La comprobación pública posterior de la ficha de fuente Arkham devolvió HTTP 200 y todavía incluyó `Product`, por lo que **no se considera desplegado ni corregido en Search Console**. Cloudflare muestra como último despliegue el de las 14:58 UTC, anterior al push; este checkout no dispone de `CLOUDFLARE_API_TOKEN` para Wrangler y el Worker no tiene un trigger de Builds conectado. Hace falta publicar la versión con una sesión autorizada y luego comprobar el JSON-LD de una ficha sin ofertas y otra con ofertas. Solo después corresponde solicitar o esperar la validación de Google.

Jonathan confirmó el modelo actual: se comparan ofertas de terceros y se ofrecen servicios de ayuda, revisión de compatibilidad y asesoría; no hay venta directa de hardware ni reseñas de compradores propios. Se verificó que el mensaje actual de portada y ficha declara que el sitio no vende productos, y que cada `Offer` estructurado atribuye el vendedor a la tienda externa. No corresponde añadir valoraciones, condiciones de envío o devoluciones propias. La documentación de crecimiento se ajustó; no cambió el estado de las tareas ni se considera cerrado G17.

### Publicación de feedback y seguridad — 25/09/2026

Se revisaron reglas y contexto de tres grupos de Facebook de PC en Argentina. Se publicó una única solicitud de críticas concretas sobre comparación, filtros, tiendas, precios y compatibilidad en [PC Gamers Argentina [OFICIAL]](https://www.facebook.com/groups/1482312995375273/posts/4520421824897693/), donde el mensaje apareció en el feed. La publicación aclara que el sitio compara ofertas de terceros, no vende hardware ni procesa compras, y ofrece ayuda para presupuestos. Los grupos de compra/venta y HD Tecnología no recibieron el mensaje por el enfoque de sus reglas. Se debe observar comentarios y registrar problemas reproducibles antes de decidir más publicaciones; una publicación visible no equivale a tráfico, leads ni conversión.

La revisión de seguridad y sus límites están en [REVISION.md](../seguridad-2026-09-25/REVISION.md). Se aplicaron dos migraciones de permisos en el proyecto Supabase vinculado y se prepararon correcciones de cabeceras/IP y dependencias. `npm audit` quedó con cero alertas en el árbol instalado; 705 pruebas aprobaron, además de lint y build. El despliegue y la verificación pública de este nuevo código se registrarán después de publicar.

### Despliegue y brecha de frescura — 25/09/2026

Tras iniciar sesión en la cuenta Cloudflare correcta, la revisión de seguridad se publicó como versión `19b544a0-6e5d-47e9-9026-4b4d5541ff86`. Las rutas públicas de portada, CPU, GPU, categorías y sitemap respondieron 200; la API administrativa respondió 401 sin sesión. La ficha de fuente Arkham usada como caso sin oferta respondió 200 y su JSON-LD contiene organización y breadcrumbs, sin `Product`, confirmando la corrección de ese caso. El estado anterior de «no desplegado» de la sección previa queda superado por esta verificación fechada; Search Console aún debe volver a rastrear y validar.

No pudo verificarse una ficha con `Product` y oferta vigente: una consulta de solo lectura a `product_prices` encontró 70 filas actualizadas en 24 horas, pero cero en las tres horas previas; el precio más nuevo era de las 10:08 UTC. El código solo considera vigentes ofertas de hasta tres horas y el cron programado corre una vez al día, con un objetivo por ciclo. Hay una brecha operativa entre la frecuencia de actualización y el umbral de validez. No se amplió artificialmente la frescura ni se presentó un precio antiguo como oferta actual. G02 sigue abierto; corresponde medir cobertura y costo de refresh antes de elegir entre mayor frecuencia, actualización a pedido o una presentación explícita de precio histórico.

### Jev y actualización del catálogo — 25/09/2026, 16:09 UTC

El repositorio tiene `ENABLE_JEV_OFFER_REVIEW=1` y el secreto `TYPESAFE_API_KEY` configurados en GitHub Actions (se comprobaron solo nombres y el indicador, no el valor del secreto). El código limita la revisión a 16 ofertas por refresh en CPU, GPU y RAM; Jev compara identidad textual entre producto y oferta, sin consultar ni verificar precio, stock o fecha. Los conflictos explícitos se resuelven con reglas locales, y una respuesta incierta permanece `needs-review`.

En la muestra de solo lectura de 24 horas hubo 70 filas de precios actualizadas: 17 de procesadores con revisión `jev-1.13.0`, todas `low-confidence`/`needs-review` (confianza media 0,484; máxima 0,71, por debajo del umbral 0,8), y 53 sin revisión de modelo. Las 17 quedan fuera de las ofertas comparables por las reglas actuales. El cron programado invoca Jev sin título recién obtenido de la tienda; la actualización a pedido sí pasa ese título. Esto sugiere revisar la calidad de evidencia y una muestra manual de falsos positivos antes de tocar el umbral o ampliar llamadas. No demuestra por sí solo que Jev sea la causa de la falta de ofertas frescas: el desfase cron diario/ventana de tres horas ya la explica a escala global.

Decisión operativa: conservar Jev como control acotado de identidad y como segunda opinión semanal para elegir entre alternativas respaldadas por métricas; la adquisición y persistencia de precios siguen siendo determinísticas. Siguiente medición para G02: precios vigentes y excluidos por `needs-review`, separados por tienda/categoría y ciclo, más duración y consumo de las llamadas. No se modificó la variable, el cron ni el presupuesto del proveedor en este corte.

### Validación y arreglo de frescura/Jev — 25/09/2026

Nueva muestra de solo lectura: 60.886 precios totales, 0 observados en las últimas tres horas, 70 en 24 horas, 73 en 48 horas y 408 en siete días; el más reciente seguía fechado 10:08 UTC. Las 70 filas de 24 horas correspondían a procesadores y 17 tenían revisión Jev `low-confidence`. Se examinaron sus títulos y rutas públicas: algunas coincidencias de modelo parecen plausibles, pero otras distinguen versiones tray/OEM o cooler que el nombre canónico omite. No se redujo el umbral de confianza de 0,8 ni se aprobaron masivamente las 17.

La investigación de código halló que el deduplicador esperaba 12 horas para volver a guardar una oferta sin cambio de precio, aunque el comparador solo aceptaba observaciones de tres horas. El ajuste local baja a dos horas el intervalo de escritura de una **nueva observación** del mismo precio y evita que una respuesta de scraper más antigua retroceda precio o fecha; el historial sigue registrando únicamente cambios reales de estado/precio. El refresh normal ahora pasa a Jev el título original leído de la tienda antes de normalizar/agrupar, tal como ya hacía la actualización a pedido. Esto mejora la evidencia de identidad sin darle autoridad sobre precio, stock o fecha.

La ficha local de un i5 12400 mostró el nuevo control para pedir actualización de hasta ocho ofertas antiguas o pendientes; el flujo reutiliza límites existentes del servidor y el lector `preferDb=1` evita mostrar una copia en caché cuando el job termina. La ficha respondió 200 y el lector devolvió `X-Product-Cache: DB-STALE` con 11 ofertas. No se despachó un refresh real en esta validación. Pruebas: 710 unitarias aprobadas, lint, TypeScript y build correctos. Falta publicar y comprobar la versión pública; el cron diario no cambió, por lo que este arreglo no convierte automáticamente todo el catálogo en ofertas vigentes.

El código se publicó en los commits `5b3643b` y `b91d903` como versión Cloudflare `62e27ce5-bc9f-4161-b0dd-6eabb218a0b0`. La muestra pública posterior devolvió 200 en portada, CPU, GPU y la ficha `agrupado-procesadores-intel-core-i5-12400-gfjrbb`. El HTML público de esa ficha incluye el control de actualización y conserva el aviso de precio anterior. `/api/products?id=...&preferDb=1` respondió 200 con `X-Product-Cache: DB-STALE` y 11 ofertas, confirmando lectura directa de la base para el estado posterior a un job. El texto anterior «falta publicar» queda superado por este corte. No se declaró como validado el recorrido de extremo a extremo porque no se solicitó un refresh real ni se midió la respuesta de Jev a los nuevos títulos.

### Prueba a pedido y límite del scheduler — 25/09/2026

Se solicitó **un solo objetivo** para el i5 12400 en CompraGamer mediante la API pública: job `eebb3b2d-1cac-413d-888c-dd253e58f661`, aceptado con 202. La cola quedó `queued` mientras se observaba: el workflow programado declara cada cinco minutos, pero las ejecuciones registradas el 24–25/09 aparecieron mayormente cada unas cinco horas. Dado que el job vence a los 30 minutos, se lanzó manualmente una sola vez [Requested offer refresh `36161373418`](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36161373418) para validar el camino completo. El workflow terminó correctamente y el job pasó a `completed` con un resultado `updated` a las 16:32 UTC.

Supabase confirmó `last_updated=2026-09-25 16:32:29.957 UTC`, `stock=in-stock` y revisión `jev-1.13.0` consistente con confianza 0,81. La API pública con `preferDb=1` devolvió la misma fecha y estado; la ficha pública emitió `Product` con `AggregateOffer`, una oferta y vendedor CompraGamer. Esto verifica una actualización real y el caso positivo del marcado. Es evidencia del flujo **con despacho manual**: no prueba que las solicitudes de visitantes se procesen a tiempo por el schedule actual. Tampoco prueba todavía que los títulos originales mejoren la confianza en el barrido normal; ese cambio espera su próximo ciclo.

GitHub advierte que los eventos `schedule` pueden retrasarse u omitirse bajo carga ([documentación oficial](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows)). El patrón observado en este repositorio hace que la cola de 30 minutos no sea una garantía de servicio. El texto del botón se ajustó para explicarlo; queda pendiente un disparador confiable y acotado antes de considerar cerrada la actualización a pedido de G02. No se amplió la frecuencia del cron diario ni se alteraron cuotas o credenciales.

La aclaración al visitante se publicó con el commit `00e823e` como versión Cloudflare `b1e07852-38df-404a-ac7f-8573f58ffce8`. La ficha pública respondió 200 y mostró «Solicitar verificación de ofertas» junto con el vencimiento de 30 minutos. El JSON-LD siguió incluyendo una `AggregateOffer` de CompraGamer. G02 continúa abierto por cobertura general y por la latencia observada del disparador automático; un job manual exitoso no cierra esas dos condiciones.

### G02: línea base por tienda y control de persistencia — 25/09/2026

El corte de Supabase de las 16:56 UTC contó **47.727 ofertas almacenadas con precio positivo y stock disponible**; solo **64** tenían una observación de las últimas 24 horas (**0,134 %**) y **una** de las últimas tres horas. El [desglose por tienda](FRESCURA-TIENDAS-2026-09-25.csv) conserva numerador, denominador y fecha. Es el catálogo completo almacenado, no una muestra prioritaria definida ni la cantidad de ofertas finalmente renderizadas. Algunas tiendas no tienen una sola oferta reciente. La meta propuesta de ≥95 % para una muestra prioritaria no se alcanzó ni se sustituyó por el cociente del catálogo total.

Se contrastaron los logs de siete ejecuciones programadas del 19 al 25/09 con `product_prices.last_updated`. Las del 19, 20 y 21/09 informaron `productCount=0` y quedaron verdes con la lógica anterior: no son ciclos útiles. Las del 22–25/09 informaron productos; el estado actual de la tabla conserva por lo menos 18, 215, 3 y 69 filas respectivamente observadas en ventanas alrededor de esas ejecuciones. Estos últimos números son **cotas inferiores**, porque una observación posterior reemplaza `last_updated`; no se presentan como total exacto de cada ciclo. El criterio «siete ciclos útiles» no está satisfecho.

El commit `7e9cd39` incorporó `scripts/catalog-freshness-report.mjs`. Cada ejecución normal registra por tienda ofertas disponibles, frescas ≤24 h y ≤3 h, pendientes de identidad entre las de tres horas, y observaciones y productos distintos persistidos durante el ciclo. Guarda un JSON como artefacto de Actions por 30 días. Un refresh que responde con productos pero no deja observaciones ahora falla en vez de aparentar éxito; `cleanup-history` queda fuera de esa regla. `candidateComparable3h` es solo un candidato por fecha, stock y estado de revisión: no sustituye la comprobación de identidad completa ni prueba render público.

La [ejecución manual acotada `36164068314`](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36164068314) terminó correctamente con la nueva medición: **80 observaciones persistidas, 22 productos distintos y 11 tiendas** desde las 16:58:14 UTC. El corte posterior contó 125/47.603 ofertas disponibles con ≤24 h y 62 con ≤3 h; nueve de estas últimas tenían identidad pendiente. El denominador cambió entre cortes y no se atribuye toda su variación a esta prueba. La versión pública Cloudflare `4fde29b5-ae0e-4d0c-acf8-92663bc76feb` respondió 200 en la ficha i5 12400 y `/comparar/procesadores`.

El mismo commit prepara un despacho inmediato mediante la API fija de GitHub, protegido por el rate limit distribuido existente (máximo uno cada cinco minutos y 30 al día). Requiere en el Worker `GITHUB_ACTIONS_DISPATCH_TOKEN`, de alcance limitado a `john2k2/comparador-hardware-argentina` y permiso `Actions: write`. **No está configurado** en Cloudflare y la página informa cuando no puede iniciar la verificación inmediata. No se reutilizó el token local de `gh`, no se leyó ni se publicó ninguna credencial. La página de creación de token en el navegador aislado pidió iniciar sesión; no se continuó con autenticación ajena. Después de configurar el secreto hay que probar una solicitud pública que aparezca como `workflow_dispatch` y termine antes de 30 minutos sin despacho manual. Hasta esa prueba, el scheduler continúa siendo una recuperación incierta, no una garantía.

G02 permanece P0/en observación: faltan siete ciclos útiles medidos con el nuevo artefacto, definir y alcanzar la muestra prioritaria de frescura, y verificar el disparador inmediato con credencial acotada. No se declara completa la actualización general del catálogo ni se modifica el umbral de identidad de Jev.

### G02: disparo automático comprobado — 25/09/2026, 17:12 UTC

Se creó un token de GitHub de alcance limitado a `john2k2/comparador-hardware-argentina`, con permiso `Actions: write` y vencimiento el 25/10/2026. Se guardó como secreto cifrado `GITHUB_ACTIONS_DISPATCH_TOKEN` solo en producción del Worker; el listado de secretos de Cloudflare confirma el nombre, sin revelar su valor. El texto anterior que indicaba «no está configurado» corresponde al corte previo y queda superado por esta comprobación.

Una solicitud pública controlada, con **una oferta** del i5 12400 de CompraGamer, respondió 202 y creó el job `e566d5d7-276c-4cf6-bd4b-1ff158529cdd` a las 17:12:18 UTC. Sin despacho manual apareció [Requested offer refresh `36165637147`](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36165637147) a las 17:12:20 UTC, terminó correctamente y dejó el job `completed`, con la oferta `updated` y `observedAt=2026-09-25T17:12:46.974Z`. Esto verifica la activación inmediata y la persistencia de una oferta dentro de los 30 minutos de vigencia del job; no valida tasas de éxito de otras tiendas.

La respuesta inicial de la API informó `dispatch=unavailable` aunque GitHub había aceptado la solicitud: la versión de la API de GitHub usada aquí devolvió HTTP 200 con detalles de la ejecución y nuestro código solo reconocía 204. El commit `45cdc34` acepta ambas respuestas exitosas; se aprobaron cinco pruebas unitarias del despachador, TypeScript, lint y build. Cloudflare publicó esa corrección como versión `4b6d76ed-1cda-4246-822f-4b862a264b5b`. Portada, CPU, GPU y la ficha i5 12400 respondieron 200 tras el despliegue.

Una segunda solicitud pública controlada respondió `dispatch=sent`, creó el job `746050f0-e5f2-4b77-a949-5a1ec6922129` y activó automáticamente [el workflow `36166218562`](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36166218562). Terminó en `completed` con una oferta `updated` a las 17:18:18 UTC. `/api/products?...&preferDb=1` devolvió para CompraGamer exactamente ese `lastUpdated` y `in-stock`. La corrección del estado comunicado al visitante y el recorrido público hasta la lectura directa de la base quedan verificados para esta oferta. El build local registró timeouts de lectura de Supabase al prerenderizar algunas búsquedas, aunque finalizó correctamente; ese síntoma no demuestra un fallo de estas rutas públicas y requiere seguimiento separado.

El criterio global de G02 sigue abierto: una solicitud exitosa no equivale a siete ciclos diarios útiles ni a alcanzar la frescura por tienda de la muestra prioritaria. También se debe renovar o sustituir el secreto antes del 25/10/2026 para mantener la vía inmediata.

### Muestra fija e identidad de RAM — 25/09/2026

Se fijaron nueve fichas (tres CPU, tres GPU y tres RAM) en [G02-MUESTRA-PRIORITARIA.json](G02-MUESTRA-PRIORITARIA.json). El reporte del cron validará que sus IDs y categorías sigan existiendo y guardará el denominador, frescura ≤24 h/≤3 h y detalle por ficha, junto al corte por tienda existente. En el corte de solo lectura de las 18:06 UTC, 11/59 ofertas disponibles de la muestra tenían una observación ≤24 h (18,6 %); CPU 11/20, GPU 0/27 y RAM 0/12. La muestra es operativa y no mide la frescura que ve cada visitante ni la identidad real de cada oferta. El primer control de siete nuevos ciclos diarios será el 03/10/2026; G02 no está completado.

La lectura pública de RAM reveló fichas Corsair LPX y RS agrupadas por claves antiguas y URLs LPX almacenadas dentro de la ficha RS. Los commits `4f17631` y `b816f77` separan las claves al buscar y releer fichas antiguas, preservando IDs públicos. Una defensa adicional marca `needs-review/explicit-conflict` cuando una URL de RAM contradice explícitamente la marca, serie, capacidad, DDR, velocidad o latencia del nombre persistido; el precio queda fuera de la comparación hasta revisión. Esto no borra ni reasigna filas de Supabase, y una URL opaca sin datos explícitos aún necesita revisión de origen. Se ejecutaron 719 pruebas unitarias aprobadas, lint, TypeScript y build.

Los commits `878ca4d` y `1905f7a` se publicaron en el Worker como versión `75d38c39-90da-4d7b-ba7e-32d2ad9c5d46`. Portada, `/comparar/procesadores`, `/comparar/placas-de-video` y la ficha RS respondieron HTTP 200. `/api/products?id=agrupado-memoria-ram-corsair-16gb-x4icqy&preferDb=1` devolvió HTTP 200 y ambas URLs LPX de la ficha RS con `identityReview.status=needs-review` y `reason=explicit-conflict`; la URL `/producto/__trashed-140/` sigue sin evidencia de identidad y requiere revisión de origen. Los nombres de los secretos `GITHUB_ACTIONS_DISPATCH_TOKEN` y `CATALOG_REFRESH_CRON_SECRET` permanecen configurados tras el despliegue; sus valores no se leyeron. El script de frescura se ejecutó contra Supabase con la muestra fija a las 18:12 UTC: 11/59 ≤24 h, 3/59 ≤3 h, nueve fichas y 25 tiendas con oferta disponible.

### Corte diario — 26/09/2026, revisión 13:00 UTC

Portada, `/comparar/procesadores`, `/comparar/placas-de-video` y la ficha i5 12400 respondieron 200, sin texto de error 1102. El scheduler [36233869658](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36233869658), evento `schedule`, terminó correctamente (job 09:48:11–09:49:22 UTC). Consultó `procesadores`, obtuvo 12 productos en la respuesta, sin fallback ni objetivos fallidos. El [artefacto conservado](cortes/2026-09-26/catalog-freshness-36233869658.json) prueba 67 observaciones persistidas en 19 productos distintos y 13 tiendas entre 09:48:44 y 09:49:02 UTC. Los productos de respuesta y los persistidos tienen alcances distintos; no se sustituyen entre sí. Es el **primer ciclo diario útil de los siete nuevos** en [G02-CICLOS.csv](G02-CICLOS.csv).

En el corte del artefacto había 132/47.607 ofertas disponibles con observación ≤24 h; 59 ≤3 h, de las cuales 14 tenían identidad pendiente. La muestra fija contó 13/60 ≤24 h (21,7 %) y 9 ≤3 h, de las cuales 8 tenían identidad pendiente; solo una es candidata por fecha, stock y estado de revisión, sin probar identidad completa ni render. CPU sumó 13/21 ≤24 h; GPU 0/27 y RAM 0/12. El artefacto contiene observaciones por tienda y productos distintos globales, pero no productos distintos por tienda. Tampoco contiene motivo, título original, confianza ni consumo de Jev, por lo que no permite atribuir las exclusiones a una causa específica ni bajar el umbral. La ausencia de cobertura GPU/RAM continúa el estado conocido, no es un nuevo incidente. Estas cifras corresponden a 09:49 UTC y no se presentan como frescura a las 13:00. G02 conserva estado, prioridad, responsable y fecha; el tablero no requiere cambios de esos campos.

Facebook volvió a limitar la lectura pública de la publicación de feedback; la búsqueda acotada de avisos específicos del grupo en el correo conectado no encontró mensajes. Comentarios: **no verificados**, no cero. No se usó el navegador de Jonathan. Hoy es sábado y no corresponde el corte semanal de GSC/GA4. No se despachó refresh ni se cambió código, despliegue, credenciales, infraestructura o presupuesto.

### Corte diario adelantado — 27/09/2026, revisión 12:55 UTC

Jonathan pidió la comprobación antes del horario diario. La automatización local figura `ACTIVE`, con ejecución prevista a las 10:00 de Chile (13:00 UTC); al comenzar eran 09:55 de Chile. Esto verifica configuración, no garantiza la ejecución del scheduler de Codex. Se adelantó la revisión y se registra este corte para evitar duplicarlo en el heartbeat del día.

Las cuatro rutas públicas (portada, CPU, GPU y ficha i5 12400) respondieron 200 sin texto de error 1102. El [scheduler 36312694788](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36312694788), `schedule`, terminó correctamente (job 10:29:30–10:30:39 UTC). Consultó `procesadores`, respondió 12 productos sin fallback ni objetivos fallidos. El [artefacto guardado](cortes/2026-09-27/catalog-freshness-36312694788.json) registra 73 observaciones persistidas, 19 productos distintos y 14 tiendas durante 10:29:56–10:30:23 UTC. Es el **segundo de siete ciclos diarios nuevos útiles**. Los productos de respuesta y los productos distintos persistidos no tienen el mismo alcance.

Corte del artefacto: 65/47.607 ofertas disponibles observadas ≤24 h, las mismas 65 ≤3 h; 14 pendientes de identidad y 51 candidatos por fecha/stock/estado. Muestra fija: 10/60 ≤24 h (16,7 %), frente a 13/60 del corte anterior; las observaciones anteriores que salieron de la ventana explican parte de esa diferencia, sin probar un fallo de persistencia. CPU 10/21, GPU 0/27, RAM 0/12. Las diez recientes tienen ocho pendientes de identidad y dos candidatos, sin verificación de render ni identidad completa. No se atribuyen motivos o costo de Jev que el artefacto no incluye; tampoco incluye productos distintos por tienda. Sigue la cobertura insuficiente ya conocida. G02 conserva estado, prioridad, responsable y fecha, sin cambio en el tablero.

La lectura pública de Facebook siguió limitada. La búsqueda de avisos específicos del grupo en el correo comercial conectado no encontró mensajes; comentarios **no verificados**, no cero. El conector requirió seleccionar el enlace de cuenta en este corte y se repitió la consulta con la cuenta correspondiente, sin mensajes enviados. No se usó el navegador de Jonathan. GSC/GA4 se revisarán el lunes. Solo se actualizaron documentos y artefactos de seguimiento: sin refresh despachado, código, despliegue, infraestructura, credenciales o gasto.

Heartbeat 27/09/2026, 13:00 UTC: el último scheduler sigue siendo `36312694788`, ya registrado en el corte adelantado de 12:55 UTC. Se cotejaron plan, backlog, métricas y tablero (G02 en curso/P0, Codex, control 03/10). No hay una ejecución nueva ni un cambio verificable de tarea; se conserva el corte anterior sin duplicar peticiones públicas, consultas de feedback, métricas, ciclos ni alertas.

### Avisos nuevos y feedback desde Chrome — 27/09/2026, 15:09 UTC

Jonathan indicó usar Chrome. Se leyó el aviso GSC del 27/09 y la validación de comerciantes del 25/09. El aviso de fragmentos conserva tres URLs rastreadas el 23–24/09; hoy las tres respondieron 200 sin `Product` incompleto en JSON-LD. El estado de Google aún no está validado. La advertencia de `hasMerchantReturnPolicy` es no crítica y su validación tiene dos pendientes, cero correctos y cero errores («tiene buena pinta», no aprobación). No se inició validación ni indexación.

Facebook sí fue accesible mediante Chrome: dos comentarios y tres reacciones. Una sugerencia propone enlaces QVL de motherboards; otra persona solicita inclusión de `scorpiopc.com`. La tienda y su representación no se verificaron, no son un sponsor ni una venta. No se respondió o contactó a nadie, y no se guardaron teléfonos ni nombres. El [informe](GSC-AVISOS-2026-09-27.md) conserva el alcance. La automatización ahora incorpora diariamente mensajes nuevos de GSC y lectura desde Chrome en pestañas independientes, por autorización de Jonathan. No cambió ningún estado, prioridad, responsable o fecha del backlog/tablero.

## QVL y difusión — 27/09/2026

- QVL incorporada a ficha de motherboard y armador; directorios oficiales y comprobación manual de kit/revisión/BIOS/CPU. Sin promesa de compatibilidad exacta.
- 28 pruebas focalizadas aprobadas (incluyen fabricante conocido/desconocido, URL fija y advertencia aunque DDR/capacidad coincidan); lint, TypeScript y build aprobados. Ficha ASRock verificada en servidor local, [captura](cortes/2026-09-27/difusion/qvl-ficha-local.png). No hay despliegue ni comprobación pública de estos cambios.
- Dos publicaciones nuevas visibles y 12 pedidos de permiso enviados por autorización de Jonathan. No equivalen a autorización ni tráfico verificado. [Evidencia](PERMISOS-GRUPOS-PUBLICO-2026-09-27.md).
- [ScorpioPC](QVL-TIENDA-Y-DIFUSION-2026-09-27.md): Maps 4,9/18 con opiniones recientes; dominio registrado 11/06/2026. Identidad fiscal, trayectoria anterior, stock real y cumplimiento de garantías siguen sin verificar.

## Ajuste del control de diseño — 27/09/2026

Se atendieron las cuatro observaciones `side-tab` del armador (líneas originales 144, 176, 197 y 210), además del aviso equivalente de precio antiguo en la línea 177. Se retiraron las franjas laterales: aviso con marco neutro completo, avisos de oferta/precio/referencia con etiqueta y lista de compatibilidad con etiquetas explícitas Error/Pendiente. Se conservan los marcos rectangulares y colores generales del estilo pixel-art. No se añadieron supresiones. ESLint del componente y diff-check aprobados; detector mecánico sobre el archivo devuelve lista vacía. Página local abierta y árbol accesible confirma las etiquetas de error. Ajuste visual local, no desplegado; no se repitió el build completo por este cambio de presentación.

## Publicación LinkedIn — 27/09/2026

LinkedIn confirmó «Se ha publicado» y abrió el post propio en el perfil de Jonathan Ortiz. Visibilidad pública, comentarios abiertos y destino UTM del enlace del texto comprobados. [Captura](cortes/2026-09-27/linkedin/publicacion-confirmada.png). [Informe](LINKEDIN-Y-SCORPIOPC-2026-09-27.md). Publicación gratuita, sin promoción pagada. No se atribuyen todavía impresiones, visitas, clics a tiendas ni consultas.

## Imagen social renovada — 27/09/2026

Nueva PNG versionada de 1200×630, 723924 bytes. Metadata predeterminada centralizada; fotos reales de producto conservadas. 34 pruebas de metadata, ESLint, TypeScript, build y diff-check aprobados. HTML local de portada, categoría procesadores y armador usa la nueva OG/Twitter; imagen 200 image/png. Inspección completa y en miniatura hecha. No desplegada; tarjeta de LinkedIn existente no actualizada. [Detalle y fuentes](LINKEDIN-Y-SCORPIOPC-2026-09-27.md).

### Tarjeta social y reemplazo de LinkedIn — 2026-09-27T20:43:51.064624+00:00

Imagen desplegada en commit `3bc2d78`; Workers Builds aprobado y HTTP público/metadata/PNG verificados. LinkedIn Post Inspector y publicación nueva muestran la imagen actual. Post activo: https://www.linkedin.com/feed/update/urn:li:activity:7510076468136194048/. Post anterior eliminado con confirmación de LinkedIn; conservar sus cortes históricos sin transferir métricas. Texto, UTM y comentarios abiertos conservados. Detalle y capturas: [registro de LinkedIn](LINKEDIN-Y-SCORPIOPC-2026-09-27.md). Cambios QVL permanecen locales; no se cierran tareas globales por esta acción.

Nota de publicación: las capturas y archivos de cortes se conservan localmente; no se incluyen en el repositorio público porque pueden contener datos de sesiones o conversaciones. Los enlaces a cortes son referencias de evidencia local.

## Preparación AdSense y control previo a publicar QVL — 27/09/2026 21:01 UTC

Se creó PLAN-ADSENSE-2026-09-27.md y se añadieron G18–G26 a BACKLOG.csv y al tablero de 27/09. Cuenta existente comprobada desde Chrome; el comparador no figuraba en Sitios. No se completó el perfil de pagos, se envió solicitud o se activaron anuncios. Datos y captura de cuenta permanecen locales.

QVL: 28 pruebas focalizadas, ESLint y build de producción con TypeScript aprobados en este turno; commit de código 527c855. Antes de subirlo, portada HTTP 503 con cuerpo error code: 1102, cf-ray a41d71bcc8fe3197-SCL. Workers Builds de 3bc2d78 figuraba exitoso. Es una recaída pública previa al despliegue nuevo; no atribuirla a QVL ni declarar recuperación por un build verde. Solicitud de AdSense condicionada a resolver G01 y confiabilidad material.

Tablero: se importó el anterior con la plantilla Project Tracker, se añadieron nueve tareas y se extendieron resúmenes/Gantt/validaciones al bloque nuevo. Celdas y fórmulas anteriores fuera de los resúmenes, dimensiones de columnas y vista de hoja conservadas; inspección sin errores de fórmula y render verificado. Fechas propuestas; G18/G19 en curso y las demás pendientes. No se cerró ninguna tarea previa. Los datos privados de destinatarios y capturas no se suben; versiones publicables anonimizadas en permisos/difusión.

## Subida y verificación pública posterior — 27/09/2026, 21:06–21:08 UTC

Se subieron cinco unidades revisables a main, hasta `af69ef8`; GitHub y el checkout quedaron sincronizados. Workers Builds `14dab63a-0f80-4c04-9064-6c207d953ecb` terminó exitoso. La subida contiene QVL (`527c855`), documentación y tablero AdSense, histórico SEO y versiones anonimizadas del seguimiento. Los originales de conversaciones/capturas quedan locales e ignorados.

Portada, `/guia/armar`, `/comparar/procesadores` y `/comparar/placas-de-video` respondieron HTTP 200 sin error 1102. Las fichas `/product/agrupado-procesadores-intel-core-i5-12400-gfjrbb` y `/product/agrupado-motherboards-asrock-am5-x870-pt7uwy` devolvieron HTTP 503 con `error code: 1102`, mientras la API de motherboards desde base respondió 200. El cliente con User-Agent de comprobación recibió 403 en ficha/API; se contrastó con curl estándar y se conserva esa diferencia en la evidencia, sin confundirla con inexistencia de productos. **Recuperación parcial; G01 sigue en observación y bloquea la solicitud AdSense.** No se confirma render público de QVL en ficha ni configuración seleccionada del armador. No se despachó refresh, modificó infraestructura o leyó secretos. El incidente ya existía antes de esta subida; estos resultados no identifican su causa. Evidencia local: cortes/2026-09-27/adsense/POSTDEPLOY.json.

Cuenta AdSense comprobada en Chrome: el comparador no figura en Sitios; información de pagos pendiente y formulario con perfil particular chileno existente ofrecido. No se completó asociación, dirección, identidad, cuenta bancaria ni términos. País definitivo, moneda y modalidad habilitada siguen pendientes de confirmación. Google exige banco en el país del perfil para transferencia y documenta EFT en CLP para Chile con condiciones según antigüedad de la cuenta; no se extrapola esa disponibilidad a esta cuenta. Fuentes oficiales: https://support.google.com/adsense/answer/7164701?hl=es y https://support.google.com/adsense/answer/1714398?hl=es.

## Ejecución de preparación AdSense — 27/09/2026, consentimiento y auditoría editorial

Objetivo activo: completar preparación antes de solicitar, no solo redactar el plan. Revisión acotada de Cloudflare: la solicitud de la ficha i5 12400 de 21:07:14 UTC en versión 185c58e0 registró outcome exceededCpu, CPU 25 ms y wall 234 ms. El corte posterior, tras la versión 59981bda de 21:10:24 UTC, devolvió 200 en esa ficha, ficha ASRock X870 (con QVL visible) y guía de un millón. Confirma recuperación del corte consultado, no disponibilidad sostenida ni causa sistémica resuelta; G01 permanece en observación. Se consultaron registros filtrados sin conservar IP ni cabeceras personales en el reporte público.

G21 inició implementación: GA4 en modo básico, etiqueta sin solicitar hasta elección afirmativa vigente, eventos comerciales bloqueados al rechazar, publicidad/Google Signals desactivados y preferencias persistidas hasta 180 días. Retiro elimina cookies _ga accesibles y recarga si la etiqueta estaba cargada; sincroniza retiro entre pestañas. Banner con decisiones equivalentes, enlace a política y reapertura desde pie de página. La política deja de presentar analítica activa como futura y explica Cloudflare/Supabase, almacenamiento funcional, imágenes, contacto y límites de conservación. Este control de GA4 no sustituye la CMP certificada requerida para anuncios personalizados en territorios aplicables.

Validación local: 19 pruebas aprobadas (VM del bootstrap, rechazo/ausencia/expiración/almacenamiento bloqueado, nonce, carga única y bloqueo posterior; eventos GA4 y footer), ESLint y build/TypeScript con 51 rutas. El último build registró timeouts de consultas de categoría con fallback durante la prerenderización; build exitoso no demuestra salud de base. Navegador Chrome aislado sobre build de producción, escritorio 1440 y móvil 390: cero solicitudes a etiqueta antes de aceptar y al rechazar, una al aceptar, ninguna nueva tras retiro/recarga, cookies removidas y sin overflow horizontal. Etiqueta Google interceptada para no enviar telemetría de prueba. Capturas/evidencia quedan locales. La primera prueba detectó UI insertada en head; se movió al body y se repitió el flujo completo con resultado correcto. Inspección visual y detector Impeccable: sin hallazgos determinísticos, sin supresiones.

G19: [inventario editorial](INVENTARIO-EDITORIAL-ADSENSE-2026-09-27.md) conserva muestra, límites y tres piezas G20. Derechos de imágenes externos desconocidos, ficha GPU y dos piezas en runtime pendientes. No se afirma revisión humana ni pruebas de hardware propias. G21 pasa a en_revision; tablero conserva estructura/fórmulas/Gantt y cambia solo estado/inicio de esa tarea más nota de fuentes. No se cierra G19/G21/G01/G02 ni se solicita AdSense. Perfil de pagos real todavía requiere confirmación de Jonathan.

Fuentes técnicas consultadas: https://developers.google.com/tag-platform/security/guides/consent?hl=es y https://support.google.com/adsense/answer/13554116?hl=es.

## Contenido y consentimiento publicados — 27/09/2026

G21: la versión 2731303 pasó pruebas locales pero la comprobación pública encontró que Preferencias de privacidad desaparecía tras hidratar el navegador. El cliente no tenía el mismo identificador GA4 que el servidor. Corrección 622f2d9: el servidor conserva el control de visibilidad y el bootstrap entrega el identificador al helper de eventos. Workers Builds aprobado. Prueba aislada pública desktop 1440 px y móvil 390 px: cero cargas de Google al entrar/rechazar, una carga al aceptar, retiro con recarga y eliminación de cookie accesible, sin desbordamiento. Se interceptó el script y se bloquearon eventos externos para no contaminar GA4. Veinte pruebas unitarias de consentimiento/eventos aprobadas. No es una CMP de publicidad ni prueba de recepción G04.

G20: f2ac9f3 incorpora metodología original para /guia/pc-gamer-2-millones, /comparativa/ryzen-5-7600x-vs-ryzen-7-5700x y /comparativa/rtx-4060-vs-rx-7600. Fuentes AMD/NVIDIA, alcance de benchmarks externos, costos excluidos y compatibilidad por motherboard/BIOS/QVL. Se eliminó la afirmación incorrecta de cooler incluido del 5700X y promesas genéricas no respaldadas. Fecha editorial solo en esas tres piezas, redacción asistida declarada y ninguna atribución inventada de ensayos o revisión humana. Comparativas: ofertas con más de tres horas o fecha inválida ya no participan del ganador actual. Guías: fecha de observación por oferta registrada y advertencia de total parcial. Lectura de comparativas acotada a dos consultas por modelo de hasta 32 filas cada una, conservando validación de identidad. Esta optimización no demuestra cobertura completa ni corrige por sí sola todas las causas de 1102.

Validación local: 43 pruebas de selección/precios/FAQ aprobadas, lint, TypeScript y build de 51 rutas aprobados. Navegador aislado en las tres rutas y dos tamaños: HTTP 200, fuentes y metodología visibles, sin desbordamiento ni errores JS en la muestra. Capturas y JSON en cortes/2026-09-27/editorial y adsense-consent-public, excluidos del Git público. G20 en revisión en BACKLOG y tablero; publicación pública y revisión humana se registran por separado. G19 mantiene derechos y muestra pendiente. G01 continúa en observación y G02 no se cierra antes de su ventana medida.

Cuenta AdSense revisada nuevamente en Chrome: Información para pagos indica Datos de pago no disponibles. Añadir cuenta de pagos ofrece un perfil particular de Chile y solicita nombre/domicilio; no presenta todavía un método bancario. No se envió el formulario ni se asociaron datos. Confirmación de residencia pendiente. Para cobro, Google exige banco/sucursal en el país del perfil; la tabla EFT incluye CLP para Chile con condición de cuenta creada después del 30/09/2015. La fecha de creación y métodos habilitados de esta cuenta no están verificados. Fuentes: https://support.google.com/adsense/answer/7164701?hl=es y https://support.google.com/adsense/answer/1714398?hl=es. Completar datos reales directamente en Google; no guardar domicilio, identificadores de perfil o datos bancarios en documentos públicos.

## Comprobación pública del contenido — 27/09/2026, 21:53 UTC

Workers Builds de f2ac9f3 aprobado. Las tres piezas G20 respondieron 200 y mostraron metodología, fuentes y fecha editorial correctas en escritorio/móvil; la comprobación no detectó errores JS ni desbordamiento. El script de prueba bloqueó telemetría externa. Ficha GPU fija Gigabyte RTX 5060 Eagle, ID agrupado-tarjetas-graficas-gigabyte-rtx-5060-eagle-8gb-1i1rdb: 200, título correspondiente y advertencias de referencia/actualización visibles. Esto valida render de la muestra, no stock ni frescura de sus ofertas. Muestra runtime de G19 completada; registro de derechos de assets compartidos y revisión humana siguen pendientes. G20/G21 permanecen en revisión; no hay solicitud de AdSense, anuncios activos ni ingresos verificados. G01 sigue en observación. El cambio de consentimiento del 27/09 altera cobertura GA4: conservar fecha y comparar ventanas identificadas, sin interpretar usuarios no medidos como cero ni pérdida confirmada de tráfico.

## Preparación de conexión AdSense — 27/09/2026

El dominio comparador-hardware.com.ar se añadió a Sitios en la cuenta existente y quedó en Debe revisarse. Se observaron en la interfaz los métodos etiqueta meta y ads.txt y se contrastó su ID público con el código; no es una credencial. Commit 0be5b5e incorpora metadato de propiedad y public/ads.txt. No incorpora scripts de anuncios ni nuevos orígenes CSP. Lint, TypeScript y build local aprobados; comprobación pública/Verificar de Google todavía pendiente de despliegue. Solicitar revisión no se accionó. G22 comenzó sin cambiar perfil de pagos ni asumir país.

Google generó automáticamente al añadir el dominio un mensaje de Reglamentos europeos, visible como Publicado. Inspección del mensaje de este dominio: idioma predeterminado inglés, 31 idiomas adicionales, consentir/gestionar/no consentir activados, optimización automática de mensajes activada. No se cambiaron opciones ni proveedores; los contadores de preview no prueban proveedores reales ni exposición pública. G21 sigue abierto hasta revisar configuración exacta, integración y retiro de consentimiento publicitario; no confundir el control GA4 ya publicado con la CMP. No se tocaron mensajes de otros sitios.

Registro de recursos compartidos en REGISTRO-ASSETS-ADSENSE-2026-09-27.md. Licencia SIL OFL 1.1 de Press Start 2P verificada contra Google Fonts y conservada sin modificaciones en public/licenses/PressStart2P-OFL.txt. Logo, favicon, sprites y OG siguen con procedencia pendiente, sin infracción o permiso inferidos. Registro por uso evita presentar todas las imágenes del catálogo como habilitadas para publicidad.

## Propiedad AdSense verificada — 27/09/2026

G22 completado. Workers Builds de 0be5b5e aprobado. Comprobación pública: ads.txt exacto con ID de la cuenta en dominio raíz y www responde 200; portada y tres piezas piloto incluyen metadato correcto y cero scripts/peticiones de anuncios. Dominio raíz también devuelve metadato correcto con 200. En Chrome, Google confirmó explícitamente Tu sitio se ha verificado mediante etiqueta meta. Evidencia local privada: cortes/2026-09-27/adsense-verification/PUBLICO.json y google-sitio-verificado.png. La verificación de propiedad no equivale a aprobación publicitaria. Solicitar revisión no se accionó; el estado del rastreo ads.txt de Google puede actualizarse después y no se presume inmediato. CSP conserva sus orígenes previos porque la conexión no carga anuncios.

G18/G19/G20/G21/G23/G24 continúan abiertos según sus controles. Perfil de pagos sin asociación completada; revisión humana y origen de recursos gráficos pendientes; CMP automática detectada pero sin prueba pública/regional ni retiro TCF verificados. G02 y confiabilidad conservan sus criterios. No hay anuncios activos ni ingresos verificados.

## Mensaje europeo y contacto — 27/09/2026

La cuenta AdSense creó un mensaje europeo automáticamente para este dominio al añadirlo. En Chrome se corrigió solo el mensaje del comparador: idioma predeterminado español; opciones Consentir, Gestionar opciones y No consentir visibles en la vista previa; optimización automática de variantes desactivada para conservar una sola experiencia de consentimiento. Cambios publicados en Google y persistencia comprobada reabriendo el editor. La vista previa en español quedó en cortes/2026-09-27/adsense-verification/mensaje-espanol-sin-optimizacion.png. No se modificó el mensaje del otro sitio ni se activó el script de anuncios. Google avisa que su mensaje puede tardar hasta una hora en mostrarse una vez haya etiqueta de AdSense; la propiedad actual se verifica solo con metadato, así que la entrega de CMP al visitante, el comportamiento por región y el retiro TCF permanecen sin prueba. El control GA4 propio sigue siendo independiente. G21 abierto.

Comprobación G04 acotada: /contacto responde 200 y sus CTA de asesoría, soporte y propuestas comerciales forman enlaces mailto al correo operativo confirmado por Jonathan. Una prueba única desde el mismo Gmail conectado hacia sí mismo con asunto de consulta apareció en INBOX; no se contó como consulta real, lead ni tráfico. Esta prueba interna demuestra recepción del propio buzón, no entregabilidad desde un remitente ajeno ni que alguien haya respondido desde el sitio. G04/recepción comercial exterior siguen pendientes hasta una prueba externa o una consulta verificable; no se inventan ceros.

## Corrección de confianza editorial comunicada por Jonathan — 27/09/2026

Jonathan revisó las tres piezas piloto y detectó precios distintos a los publicados por las tiendas y placas sin una publicación que permita corroborar su precio. La revisión humana de G20 no está aprobada. Se corrigió la lógica de guías para usar solo ofertas con observación válida de ≤3 h y stock informado; sin ella la fila muestra “Sin precio reciente” en vez de un estimado numérico. El subtotal se declara incompleto cuando faltan piezas, y las comparativas identifican fecha de observación y enlazan las publicaciones para comprobar el precio. Una observación reciente sigue sin garantizar que el comercio mantenga precio o stock; la confiabilidad del catálogo G02 continúa abierta.

Jonathan declaró que logo, favicon, sprites del fondo e imagen social nueva fueron creados para el proyecto sin material externo. REGISTRO-ASSETS-ADSENSE-2026-09-27.md conserva la declaración con alcance limitado; no abarca fotos de comercios ni el OG legado. G19 sigue abierto por plantillas a escala y recursos restantes. Comprobación pública puntual de portada, /comparar/procesadores, /comparar/placas-de-video y /guia/pc-gamer-2-millones: HTTP 200 en las cuatro. Es una muestra de disponibilidad y no cierre de G01.

Extensión local del presupuesto: `resolveGuideReferenceOffer` selecciona la observación válida más reciente de una publicación conocida, con identidad aceptada y URL HTTPS, limitada a 30 días. Nunca entra a `catalogTotal`. La guía de $2M mostró cinco referencias fechadas, 0 ofertas ≤3 h y botón para comprobar esas cinco publicaciones cuando la función a pedido está habilitada. GPU y gabinete sin referencia disponible en esa muestra. Pruebas focalizadas 37/37, TypeScript, lint y build aprobados. La cola real y el reflejo público del resultado todavía requieren comprobación después del despliegue.

## Prueba pública de actualización del presupuesto — 27/09/2026, 22:32–22:38 UTC

Build de 69cf74b aprobado. La guía de $2M respondió 200, mostró cinco referencias y botón `Comprobar 5 publicaciones`. Una solicitud única desde navegador aislado creó el job 2f7a71c9-2b9c-468b-adf1-0e49d9a042b0; despacho `sent`. El [workflow 36355616678](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36355616678) terminó `success`, pero el job terminó `partial`: 2/5 ofertas actualizadas (CPU Katech y RAM Maximus) y 3/5 fallidas (GoldenTech). Después de vencer la caché, la guía pública mostró solo 1/7 partes con precio reciente: CPU. La RAM persistida conserva `needs-review`, motivo `low-confidence`, y no entra a la recomendación. El resultado confirma la ruta a pedido y también sus límites; no cierra G02 ni aprueba el presupuesto.

En la selección de referencias se detectaron dos coincidencias incorrectas: un SSD SATA para un slot NVMe y una fuente Bronze para un slot Gold. Se agregaron guardas por interfaz y certificación de la especificación, para referencias y ofertas actuales. Además, el catálogo público contenía 25 resultados de RTX 4060 y 16 de RX 7600 que no entraban en la lectura genérica de las últimas 24 GPUs. La guía ahora consulta hasta dos modelos GPU concretos cuando falta oferta o referencia, con caché separada de 5 min y límite de ocho resultados por consulta. La muestra local corregida mostró referencia RX 7600 fechada y no presentó SATA/Bronze como equivalentes. La disponibilidad y frescura de esa GPU siguen sin verificar hasta una nueva consulta a la tienda. Se observó un 503 aislado del sprite compartido mientras la guía respondía 200; dos peticiones posteriores al SVG respondieron 200. G01 sigue en observación.

## Comprobación adicional — 27/09/2026, 22:45–22:52 UTC

El build de 57b1f43 terminó correctamente. Una solicitud limitada a la RX 7600 de CompraGamer creó el job c68d730d-8234-4476-b228-bb61e72ecfee y el [workflow 36356379220](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36356379220) terminó con la oferta actualizada. La lectura directa de base mostró $533.350 observado a las 22:45:53 UTC, identidad consistente (0,89). La publicación de la tienda, inspeccionada en navegador aislado, mostraba ese mismo precio con 10% de descuento por depósito o transferencia; otros medios figuraban a $592.611. Tras vencer la caché, la guía de $2M mostró 2/7 piezas recientes y subtotal parcial $904.870. El subtotal omite RAM pendiente de identidad y las otras cuatro piezas sin precio reciente; no equivale al costo total de armar la PC.

La guía de $1M mostraba 0/7 piezas recientes y una publicación conocida; la de $3M, 0/7 y tres publicaciones conocidas antes de pedir la segunda comprobación. El job d54e763b-21b6-4027-9db0-03644531569b se despachó desde la guía de $3M; el [workflow 36356677673](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36356677673) terminó bien y las 3/3 publicaciones se persistieron. La fuente de SCP Hardstore pasó a $185.878; la RAM de CompraGamer a $994.600, confirmada directamente en su ficha con descuento por transferencia (otros medios $1.105.111); la RTX 5070 de Katech a $1.732.550, pero su revisión quedó `needs-review` por baja confianza. Esas tres persistencias no implican tres precios aptos para el presupuesto: la GPU no debe recomendarse hasta resolver identidad.

El render público de $3M después de la caché mostró 3/7 partes y subtotal parcial $1.551.998, pero descubrió que el selector genérico colocaba un Ryzen 5 7600X en una guía que especifica Ryzen 7 7700X/7800X3D. También elegía como referencia histórica una RTX 5070 Ti cuando la guía especifica RTX 5070 normal o RX 7800 XT. Se corrigió la selección editorial para exigir las piezas declaradas y comparar exactamente familia/número/variante de GPU; las alternativas de armado libre siguen en el constructor. El presupuesto ahora advierte si incluso el subtotal observado supera el objetivo. Hay pruebas de regresión para CPU y variantes Ti/XT; falta comprobar el nuevo render público tras el siguiente build.

La comprobación limitada de $1M creó el job bf6531ca-39a3-4d04-b732-c833581f256a y el [workflow 36356994444](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36356994444) terminó `failure`: 0/1 ofertas verificadas. La publicación histórica asociada a “MSI B550M-A PRO” abre ahora una ficha titulada “MSI PRO B550M-B AM4” en SCP Hardstore, diferencia de modelo que impide tratarla como el mismo precio. No reintentar automáticamente ese enlace ni sumar un precio manual; requiere corregir el enlace/identidad del catálogo o encontrar una oferta nueva del modelo correcto.

El build de bc01679 terminó correctamente. En la comprobación pública las tres guías respondieron 200: $1M 0/7, $2M 3/7 y $3M 2/7 piezas recientes. La de $3M ya no muestra el Ryzen 5 ni la referencia RTX 5070 Ti. La de $2M todavía aceptaba un kit DDR5 6000 como reemplazo de un kit especificado a 5600; por ello se añadió una guarda conservadora para velocidad y formato 2x16/2x8. Hasta validar el siguiente build, el 3/7 y su subtotal $1.899.470 representan una selección anterior que no debe presentarse como presupuesto final de esa guía.

El build de b8407d8 también terminó correctamente. Comprobación pública final de las tres rutas: $1M HTTP 200, 0/7 piezas recientes y sin subtotal; $2M HTTP 200, 2/7 y subtotal parcial $904.870 (Ryzen 5 7600X y RX 7600); $3M HTTP 200, 2/7 y subtotal parcial $1.180.478 (kit DDR5 6000 y fuente Gold). La RAM DDR5 6000 quedó excluida de $2M porque la guía exige 5600; el Ryzen 5 y RTX 5070 Ti no aparecen como alternativas de $3M. Los dos subtotales siguen siendo incompletos, condicionados al medio de pago y sin envío; no representan precios de PC armada. G02/G20 continúan abiertos.


## Precios comprables y rearmado de $2M — 27/09/2026, final 28/09 00:16 UTC

Jonathan pidió usar la siguiente oferta disponible y rearmar la guía para respetar ARS 2.000.000. Correcciones de selección, consulta de las siete piezas, frescura por oferta y Venex publicadas entre 1c13884 y 4124240. Build 54ae2ad5-ce7b-4e4d-8474-14c814349be2 aprobado para 4124240. La primera migración sobre updated_at fue insuficiente por el trigger de contenido; la corrección registra last_scraped_at con observación real, sin alterar fechas/precios de ofertas ni permisos de la RPC. Archivos locales alineados con historia remota.

Comprobación final aislada en Chrome: tres guías, ancho1280 y390, las seis respuestas200, sin erroresJS ni desbordamiento. Todas las listas excluyen filas sin oferta elegible. $2M muestra7/7 a ARS1.934.428: 7600 conWraithStealth, RX7600, DDR5 16GB single, KingstonNV3 1TB, MSI PROB650M-B, fuente650WGold y Elite302. Margen65572; no incluye envío/armado/licencia/periféricos. Una RAM White de421350 agrupada con nombreBlack conserva needs-review y no entra; siguiente WhiteRGB436400 consistente. $1M1/7 subtotal71999 y $3M2/7 subtotal1180478: continúan incompletas y no se declaran PCs comprables completas.

752 pruebas aprobadas y2 omitidas; lint, TypeScript y build aprobados. Capturas/JSON en cortes/2026-09-27/precios-presupuestos/PUBLICO-FINAL.json y publico-final-1280.png/publico-final-390.png; evidencia privada excluida de Git. [Informe](PRECIOS-Y-PRESUPUESTOS-2026-09-27.md) conserva jobs, fracasos sin observaciones, fuentes, cifras y límites. Los jobs manuales de este presupuesto no cuentan como siete ciclos útiles diarios deG02. G01/G02/G20 siguen abiertos; no se solicitaAdSense ni se afirma aprobación humana por tests o stock.

## Consistencia de recursos y FAQ — 28/09/2026, 00:28 UTC

Dos referencias Organization a la imagen legada pasan a la imagen social versionada con procedencia declarada. Búsqueda en `src`: ningún uso restante de `og-image.png` o `og-image.svg`. La FAQ del índice de guías explica la siguiente oferta válida y listas con subtotal parcial, acorde al selector publicado. Inventario y registro de recursos conservan el histórico y los permisos no acreditados de fotos de tiendas.

Verificación local proporcional: 72 pruebas focalizadas aprobadas en cuatro archivos (JSON-LD del sitio, metadatos de producto, constructor y precios de guías); ESLint de los tres archivos fuente y TypeScript aprobados; diff sin errores de espacios. Comprobación pública del build pendiente en este registro. No hay cambios de base de datos, credenciales, consentimiento, scripts publicitarios ni estado de tareas. Reversión independiente: restaurar estos tres archivos fuente para deshacer las referencias/FAQ, conservando el registro documental y las correcciones anteriores de precios.

Build de `4ff1e6d`, `54ceb853-390c-4081-9f04-9796d84e27a5`, aprobado. Corte 00:35–00:36 UTC: portada, índice de guías y ficha ASRock X870 responden 200, Organization usa la imagen versionada nueva, cero etiquetas de script publicitario y FAQ corregida visible en HTML. Evidencia privada en cortes/2026-09-27/adsense-editorial-final/RECURSOS-PUBLICOS.json. Es una muestra de disponibilidad, no cierre de G01.

## Modelos y formato del presupuesto — 28/09/2026, 00:36 UTC

La revisión de compatibilidad descubrió que el selector genérico no compara el formato físico entre motherboard y gabinete. Resguardo focalizado: guía $2M fija MSI PRO B650M-B y Elite 302, modelos verificados en fuentes oficiales con formatos mATX y Mini-ITX/mATX admitidos. `exactModel` exige coincidencia de designación con límites de palabra y se aplica a ofertas recientes y referencias históricas. Una variante B650M-P o un sufijo de gabinete distinto no se usa para abaratar esta selección. Se mantienen las ofertas alternativas del modelo elegido.

754 pruebas aprobadas, dos omitidas; lint y TypeScript aprobados. El caso completo de siete piezas conserva total ARS1.934.428 en fixtures; ese test no prueba stock actual. Comprobación pública de la nueva selección pendiente. Reversión independiente: retirar exactModel de esta guía y el filtro de modelos, conservando las correcciones anteriores de frescura; hacerlo reabre el riesgo de reemplazo físico, por lo que requiere una solución de compatibilidad antes de recomendar otra pareja. No se cierra el pendiente general del armador ni G02/G20.

Para esas dos piezas fijas, la fila comprable conserva también la descripción editorial comprobada; la conversión anterior la dejaba vacía. Así queda visible el formato del fabricante junto al título comercial y el enlace de la tienda. No se activan descripciones genéricas no revisadas de las otras piezas/guías. Verificación posterior: 49 pruebas de precios/constructor y ESLint aprobados; la comprobación pública incluirá ambos formatos visibles.

Comprobación pública final 28/09/2026, 00:43 UTC: builds de c2499cf y 7bc92fa aprobados; último build d6cefa0c-4d2c-4bbd-b6f3-2d2efc496554. Chrome aislado en 1280 y 390 px, dos respuestas200: 7/7 ofertas y ARS1.934.428, MSI PRO B650M-B con detalle mATX/DDR5/PCIe4 visible, Elite302 con MiniTower y formatos admitidos visibles, fuentes MSI/CoolerMaster enlazadas, ninguna fila sin precio. Cero erroresJavaScript, solicitudes publicitarias o desbordamientos en esta muestra. Capturas inspeccionadas y JSON guardado en cortes/2026-09-27/adsense-editorial-final/PRESUPUESTO-PUBLICO.json y presupuesto-1280.png/presupuesto-390.png. La primera lectura de las 00:41 todavía mostraba la versión anterior sin esos detalles; no se usó para declarar publicado el cambio.

El seguimiento diario existente se actualizó mediante la herramienta de Codex: conserva horario, estado ACTIVE y restricciones; añade el corte de $2M, los modelos comprobados y la distinción entre expiración de una oferta, observaciones de tiendas y ciclos útiles. Los datos administrativos, aprobación editorial, consentimiento publicitario/contacto y confiabilidad mantienen sus controles pendientes. No cambió el estado/fecha/responsable de ninguna tarea, por lo que el tablero se conserva.

## G23: bloque y maqueta de desarrollo — 28/09/2026, 01:05 UTC

Bloque real 5184718883 creado en AdSense como Display fijo300×250; código y relectura de lista verificados. No se instaló el código del proveedor. ads.txt raíz/www comprobado con navegador/Mediapartners-Google, cuatro200 y texto correcto; la simulación de User-Agent no prueba rastreo de Google y su UI sigue No se encuentra.

Tres nuevas pruebas de guardas aprobadas; ESLint, tsc y build aprobados. Maqueta local en guía2M y dos comparativas, viewports1280/390/320: tamaño300×250 donde cabe y ocultación en320, rótuloPublicidad, cero overflow/errores/ins/adscript/adrequests. Producción local con ADSENSE_PREVIEW=1: tres200 y ningún espacio ni petición publicitaria. Matriz incluye GA4 aceptada/rechazada y hosts bloqueados; no se usa como prueba de CMP ni de anuncios reales. Detector mecánico[], revisión Impeccable ship limitada al componente, sin arreglos materiales. Evidencia privada en cortes/2026-09-27/adsense-preparation.

G23 en_revision, sin cierre de proveedor/CMP/CSP. Tablero actualizado únicamente en estado/inicio G23 y nota de fuente; conserva tareas ajenas y expresiones de fórmulas, formatos y Gantt. Se conserva fecha objetivo09/10. Solicitud AdSense y publicidad continúan sin activar. Detalle y requisitos pendientes en ADSENSE-ESPACIOS-PREFLIGHT-2026-09-27.md.

## Control de preparación y medición — 28/09/2026, 13:36 UTC

[Control fechado](CONTROL-ADSENSE-Y-CATALOGO-2026-09-28.md): scheduler36416720473 success, corte11:37:48UTC con1fila/1producto actualizado, disponibles≤24h16/47610 y≤3h0/47610; muestra fija≤24h1/60 y≤3h0/60. La fila observada de Shopgamer no implica oferta comprable; el esquema histórico no precisa stock/precio de esa fila. G02-CICLOS conserva dos ciclos útiles anteriores y el nuevo pendiente_calidad, sin cierre G02. Guía$2M en Chrome aislado móvil13:32UTC: HTTP200, sin overflow/erroresJS,1/7 piezas y subtotal incompletoARS123918. No se pulsó refresh ni se interpreta que las seis piezas estén agotadas. Importe de anoche histórico, no precio completo vigente.

Mejora de scripts/catalog-freshness-report.mjs: campos compatibles anteriores más productos distintos por tienda y observaciones con precio positivo/stock disponible. La tabla conserva tiendas observadas sin ofertas disponibles. Conteo exacto ausente falla en vez de transformarse en cero. Cinco pruebas locales aprobadas, incluidas dos del CLI contra fixture HTTP sin Supabase real; sintaxis y ESLint aprobados. No cambia scraping, frecuencia, persistencia, CSP ni infraestructura. Los nuevos campos se comprobarán en un artefacto posterior; no se agregan retroactivamente al corte de hoy.

[Decisión CSP](ADSENSE-CSP-Y-CONSENTIMIENTO-2026-09-28.md): documentación Google no respalda lista fija de dominios como integración estable de AdSense. Nonce público correcto y rechazo analítico funcional en comprobación de comparativa01:20UTC; no se confirma un fallo de Next ni se altera política a partir de lectura de código. Preparación/solicitud separadas de pruebas con anuncios reales tras aprobación, sin dar G23 por terminado. Jev no disponible; no se simula asesoría. Estados, prioridades, responsables y fechas del tablero no cambian en este corte. Solicitud y anuncios siguen apagados; pendientes humanos/externos conservados.

Implementación del informe versionada en `3405025`; el scheduler de hoy corresponde a `99531b0` y todavía no demuestra el esquema nuevo en producción. No se ejecuta un refresh para adelantar esa evidencia.

Verificación pública final01:14UTC: db38b9e publicado, buildWorkers e5307819-5af7-466d-8c08-e7164f42206a success. Tres200 en1280/390/320, ninguna maqueta, ins, script, petición publicitaria, errorJavaScript u overflow; PRODUCCION-PUBLICA.json. Comparación ZIP/XML del XLSX contra copia anterior: solo B50/E46/G46 cambiados;865fórmulas, estilos y características nativas conservadas. Reporte de diseño acotado del componente conservado en docs/design/adsense-editorial-preview, sin rediseño global ni evidencia privada publicada. Seguimiento automático actualizado mediante herramienta Codex conservando horario y estadoACTIVE.

## Presupuestos: alternativas seriales — 28/09/2026

[Detalle y reversión](GUIA-ALTERNATIVAS-2026-09-28.md). La selección de $2M se renueva por grupos: hasta tres rondas, solo piezas pendientes y sin solicitudes simultáneas. Persistir una observación no equivale a tener una oferta disponible; el worker devuelve elegibilidad por separado. Se mantienen cuotas, frescura de tres horas, modelos y caché de cinco minutos. HTTP200 local, fixture con siete piezas y alternativa de GPU: rondas7+1, sin errorJavaScript/overflow320/390/1280. No prueba stock real ni autoriza cierreG02/G20/AdSense. Publicación y medición real pendientes de registro.

Corte posterior14:26UTC: b2433da publicado con build67c8df39 success.84pruebas focalizadas aprobadas; móduloon-demand35aprobadas/1omitida. Una sesión real renovó cuatro ofertas comparables; CPU/RAM quedaron provider-unavailable de identidad y tres referenciasGPU observadas agotadas. Se detectó carrera de cola entre sondeo y segundo lote: espera10s aplicada en1bf0b5e, Bash y bucleconfixtures aprobados, máximo2lotes conservado. Recuperación manual36435631464 completó la segunda solicitud; no equivale a prueba automática ni ciclo útil diario. Público200,4/7,subtotalincompletoARS633067,sinJSerror/overflow390. G02/G20 siguen abiertos; no hay presupuesto completo vigente bajo$2M en este corte. Seguimiento actualizado preservando horario/estado/histórico; tablero sin cambios de campos verificables.

## Estado AdSense — 28/09/2026, 15:50 UTC

[Comprobación autenticada y pública](ADSENSE-ESTADO-2026-09-28.md): Debe revisarse, botón Solicitar revisión disponible, sin motivo de rechazo mostrado en el detalle. No se solicitó revisión. ads.txt conserva No se encuentra con fecha27/09 18:54GMT-3; raíz/www responden200 con texto e ID correctos. Metadato público correcto y robots permite el archivo. No se encontró Buscar actualizaciones en los controles visibles. El reconocimiento por Google sigue sin verificarse; la respuesta pública no demuestra su rastreo. Datos administrativos y controles internos G18/G20/G21/G23/G24 siguen pendientes. Tablero sin cambio de estado/fecha/prioridad/responsable.

## Presupuesto máximo — 28/09/2026

Guía$2M pasa a hasta$2M. El subtotal observado bajo el techo no obliga a gastar el saldo; una selección por encima del máximo no se ofrece como lista comprable ni maqueta publicitaria. 67pruebas focalizadas aprobadas, incluyendo siete piezas con1.6M/2M aceptados y2M+1 fuera del límite; lint, TypeScript y build51rutas aprobados. No cambia modelos/compatibilidad, ni completa las ofertas faltantes por un test. Ver GUIA-ALTERNATIVAS-2026-09-28.md. Publicación pendiente de lectura pública; G02/G20 y solicitudAdSense siguen abiertos.
