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

La lectura pública de RAM reveló fichas Corsair LPX y RS agrupadas por claves antiguas y URLs LPX almacenadas dentro de la ficha RS. Los commits `4f17631` y `b816f77` separan las claves al buscar y releer fichas antiguas, preservando IDs públicos. Una defensa adicional marca `needs-review/explicit-conflict` cuando una URL de RAM contradice explícitamente la marca, serie, capacidad, DDR, velocidad o latencia del nombre persistido; el precio queda fuera de la comparación hasta revisión. Esto no borra ni reasigna filas de Supabase, y una URL opaca sin datos explícitos aún necesita revisión de origen. Se ejecutaron 719 pruebas unitarias aprobadas, lint, TypeScript y build; falta comprobar esta última defensa en la versión pública.
