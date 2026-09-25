# Comparador Hardware: revisión y plan de crecimiento

Fecha de revisión: 12 de septiembre de 2026. Responsable de decisiones: Jonathan. Coordinación técnica y seguimiento: esta tarea de Codex.

## Decisión principal

El sitio ya recibe búsquedas con intención de comparar hardware, pero primero necesita disponibilidad, precios confiables y medición de derivaciones a tiendas. Después se puede vender un piloto publicitario medible. La prioridad no es llenar la página de banners ni ampliar indiscriminadamente el catálogo.

Mantener tres resultados activos: **sitio confiable**, **tráfico que llega a comercios**, **primer piloto comercial**. El futuro servicio de armado/reparación reutilizará contenido, reputación y consultas; su mercado geográfico aún debe definirse.

## Línea base verificada

Search Console, propiedad `https://www.comparador-hardware.com.ar/`, búsqueda Web, sin filtro adicional de país/dispositivo. Consultado el 12/09; última actualización visible: hace 5,5 horas. Las cifras abreviadas conservan el redondeo de la interfaz.

| Métrica | 28 días: 13/08–09/09/2026 | Interpretación |
|---|---:|---|
| Clics orgánicos | 256 | Clics de Google, no usuarios únicos ni ventas |
| Impresiones | 13,9 mil | Existe visibilidad que se puede convertir mejor |
| CTR | 1,8% | Analizar por consulta/página/posición antes de atribuir causas |
| Posición media | 8,7 | Promedio agregado; no significa que todas las consultas estén en primera página |
| Consultas mostradas | 695 | Incluye límites y omisiones propios del informe |
| Clics a portada | 166 | 64,8% del total: concentración alta |
| Clics desde Argentina | 246 | 96,1% del total |
| Clics ordenador / móvil / tablet | 145 / 110 / 1 | El móvil representa 43,0% de los clics |

El selector de 3 meses muestra datos del 24/07 al 09/09: 389 clics, 18,9 mil impresiones, CTR 2,1%, posición 8,5 y 823 consultas mostradas. No comparar ese acumulado con 28 días como si fueran ventanas equivalentes.

### Páginas prioritarias del mismo corte de 28 días

| Página | Clics | Impresiones | CTR calculado |
|---|---:|---:|---:|
| `/` | 166 | 3.022 | 5,49% |
| `/search?category=tarjetas-graficas` | 12 | 1.655 | 0,73% |
| `/guia` | 7 | 408 | 1,72% |
| `/guia/pc-gamer-2-millones` | 4 | 952 | 0,42% |
| `/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x` | 4 | 618 | 0,65% |
| `/guia/pc-gamer-1-millon` | 4 | 327 | 1,22% |
| `/search?category=procesadores` | 3 | 1.248 | 0,24% |
| `/comparar/procesadores` | 3 | 497 | 0,60% |
| `/guia/pc-gamer-3-millones` | 3 | 356 | 0,84% |

La migración a categorías limpias está reflejada en GSC: el resumen señala aumento de impresiones en `/comparar/procesadores` y caída en la URL antigua. Evaluar ambas como una misma familia antes de declarar una pérdida de tráfico.

### Indexación

Resumen: **3.166 indexadas y 831 sin indexar**. No son 831 errores a reparar automáticamente.

| Motivo | Páginas | Acción |
|---|---:|---|
| Descubierta, actualmente sin indexar | 519 | Priorizar fichas con demanda y al menos dos ofertas realmente útiles |
| Excluida por noindex | 289 | Auditar muestra: muchos filtros y resultados deben seguir excluidos |
| Rastreada, actualmente sin indexar | 11 | Revisar contenido, duplicados, ofertas y enlazado |
| Alternativa con canónica adecuada | 4 | Normal si la canónica es correcta |
| Otro 4xx | 2 | Revisar URLs y respuesta actual |
| 404 | 2 | Distinguir bajas válidas de enlaces rotos |
| Soft 404 | 1 | Inspección puntual; no asumir que persiste tras cambios recientes |
| Bloqueada por robots | 1 | Comprobar intención |
| Google eligió otra canónica | 2 | Contrastar duplicados y señales canónicas |

Core Web Vitals: **sin datos** en móvil y ordenador. No equivale a aprobado. La cuenta, propiedad y flujo web de GA4 ya están configurados para el sitio y su etiqueta se publicó el 12/09, pero Google puede tardar hasta 48 horas en comenzar a mostrar datos. Sesiones GA4, clics salientes, leads, ingresos y sponsors activos siguen **no verificados**; nunca registrar como cero. Semrush no se actualizó en esta revisión.

## Evidencia técnica y hallazgos

### P0 — Disponibilidad pública y actualización del catálogo

- GitHub Actions: las ejecuciones del 10, 11 y 12/09 terminaron en fallo. La del 09/09 fue cancelada. De los últimos siete resultados consultados, seis fallaron y uno fue cancelado.
- La ejecución del 12/09, `34685188331`, devuelve `HTTP 503` y `error code: 1102`.
- Portada abierta en navegador el 12/09 a las 14:10:26 UTC: “Worker exceeded resource limits”, Ray `a39f7ee64fc28937`.
- Un primer muestreo recibió 200 en portada, CPU y contacto. Un segundo muestreo recibió 503/1102 en GPU, acerca, guía de dos millones, ficha de producto, búsqueda Ryzen 5 5600 y destino de la categoría antigua. Es un fallo público observado; estos pocos pedidos no permiten calcular uptime ni atribuir causalidad a la auditoría.
- Cloudflare API confirma un despliegue activo creado el 09/09 a las 23:51 UTC, versión `fac99edd-99eb-434a-a6d8-7704b1b293fe`. No se asume que coincide con el árbol local modificado.
- Código: `.github/workflows/catalog-refresh.yml`, `src/lib/admin/catalog-refresh/execution.ts:29`, `types.ts:15`, `route-handler.ts:82`. El scheduler llama a un Worker que vuelve a invocar endpoints con scraping. Aumentar reintentos no resuelve por sí solo el límite de recursos.

**Trabajo propuesto:** medir CPU/memoria por ruta y fase; confirmar flags, cache y destino activos sin mostrar secretos; separar extracción pesada de la atención pública. Evaluar ejecutar lotes por tienda/categoría en GitHub Actions y persistir resultados, manteniendo el Worker para lectura/cache. Es una hipótesis de arquitectura que necesita prueba acotada, no una migración ya aprobada o completada. Mantener costo cero como primera alternativa.

**Cierre:** siete ciclos diarios consecutivos útiles, sin 1102 en muestra pública; registros de resultados y frescura por tienda; prueba real del despliegue servido. No despachar campañas hasta estabilizarlo.

### P1 — Canal comercial publicado; falta prueba de recepción

El correo operativo se configuró y publicó el 12/09 en `/contacto`, con enlaces diferenciados para soporte y propuestas comerciales que registran solo intención, tipo y canal. El texto explica el piloto, la independencia del orden orgánico y los límites de la propuesta.

**Trabajo:** enviar y confirmar una consulta de prueba, publicar una entrada “Promocioná tu tienda” con oferta clara, formulario o mailto medido, categoría y alcance del negocio. No prometer respuestas que no podamos cumplir.

**Cierre:** una consulta de prueba llega al buzón correcto y queda registrada una sola vez; CTA accesible en móvil y desktop.

### P1 — Medición GA4 recién activada; falta evidencia de eventos

`src/components/functional/Analytics.tsx` emite manualmente el `page_view` inicial y por navegación después de cargar la etiqueta, con `send_page_view: false` para no duplicarlo. El 12/09 se creó la propiedad y flujo web autorizados, con medición mejorada activa. El build y despliegue de la versión `7d20dfa4-fe32-40e2-a824-36fe93093ee3` incorporan el cargador gtag; la portada pública devuelve 200 y su CSP permite `googletagmanager.com` y `google-analytics.com`.

Todavía no hay evidencia de sesiones o conversiones en los informes. Google advierte que la recepción inicial puede tardar hasta 48 horas. No se debe interpretar esta configuración como datos de tráfico ni rendimiento de campañas.

**Trabajo:** cuando aparezca el primer evento, validar en DebugView/tiempo real exactamente un `page_view` inicial y por navegación, además de búsqueda, ficha, clic a tienda y lead. No enviar datos personales y no duplicar conteos entre medición mejorada y eventos propios.

### P1 — Oferta agotada no debe parecer disponible

`src/lib/price-utils.ts:261` añade ofertas `out-of-stock` al conjunto comparable. `src/app/product/[id]/page.tsx:60` usa su longitud para indexación; `src/lib/product/product-page-metadata.ts:105` incluye esas ofertas en el agregado; `src/lib/seo/sitemap.ts:51` cuenta precio/URL sin stock.

Las ofertas individuales sí llevan disponibilidad en JSON-LD. El defecto es la mezcla de conjuntos: el agregado puede mostrar un mínimo agotado distinto del mínimo disponible y el texto/conteo puede sugerir comercios disponibles. No declarar inválido todo el schema.

**Trabajo:** separar ofertas visibles, disponibles y elegibles para comparación/indexación; mantener agotadas identificadas cuando aporten contexto. Probar un producto con una tienda disponible y otra agotada, y otro sin stock.

### P1/P2 — El sitemap escala leyendo todo el catálogo

`src/lib/seo/sitemap.ts:19-80` lee todos los productos agrupados y sus ofertas tanto para contar como para devolver cada página; pagina recién después de cargar y deduplicar. `/sitemap-index.xml` tardó 13,65 segundos en una medición aislada. No es un p95 ni prueba de que este código sea la única causa del 1102.

**Trabajo:** snapshot/cache del conjunto elegible y conteo en base de datos, paginación estable y publicada de forma coherente. Conservar el último sitemap válido cuando falle una dependencia; no presentar una lista vacía transitoria como baja del catálogo.

### P2 — Búsqueda y conversión

- `SearchExperience.tsx:18`, `SearchPageClient.tsx:75` y `SearchPageView.tsx:61`: la condición de landing SEO deriva del estado inicial. Revisar transición categoría → consulta/filtros para que título e introducción representen lo que el usuario ve. Confirmado en código; reproducción visual de producción pendiente por 503.
- En `SearchPageClient.tsx:129`, algunos cambios de filtros no generan evento: sort, borrar categoría, cambiar tiendas manteniendo igual cantidad. Comparar valores, no solo longitud.
- `ProductDetailClient.tsx:103` fija productos relacionados como array vacío: el módulo existe pero nunca aparece. Activarlo solo con recomendaciones del mismo contexto y precios fiables.
- Cards de comparativas y filas de componentes de guías no tienen toda la atribución que sí tienen ProductCard y StoresList. Añadir eventos equivalentes sin reescribir el sitio.
- La portada observada muestra lenguaje interno como “fallback” y curación en reconstrucción, y una selección popular concentrada en motherboards MSI. Revisar relevancia/diversidad y explicar actualización con lenguaje para compradores.

### P2 — Observabilidad y seguridad operativa

- La telemetría no es exclusivamente memoria: `src/lib/metrics/storage.ts:16` persiste en `api_cache_entries`, con TTL 48 h (`constants.ts:5`), y el snapshot mira 24 h. No alcanza como serie comercial de 28/90 días.
- `recorder.ts:39,65` dispara persistencia sin esperar; `storage.ts` no comprueba el error devuelto por upsert. Verificar durabilidad real en Worker y contabilizar fallos, sin crear almacenamiento ilimitado.
- Auth admin usa `getUser()` y `app_metadata`; bypassDb requiere privilegios; refresh interno firma cabecera; hay políticas RLS en migraciones. Se revisaron esos contratos, no se certificaron las políticas efectivas de producción.
- `npm audit --omit=dev` devuelve cuatro entradas: tres altas y una moderada, con arreglos disponibles. Incluye cadena wrangler → miniflare → sharp y baseline-browser-mapping. Son entradas relacionadas, no cuatro exploits independientes. Determinar exposición de runtime frente a build y actualizar con lockfile y prueba OpenNext.
- Documentación operativa desalineada: AGENTS menciona Vercel y telemetría en memoria, pero el despliegue activo es Cloudflare y existe persistencia. Corregir al cerrar el trabajo técnico.

## Qué se revisó y qué falta

Inventario: 412 archivos versionados bajo src/e2e/supabase/.github; 51 archivos en la carpeta de scrapers. Graphify se usó como mapa y se contrastaron rutas actuales. Revisión amplia por subsistemas, con lectura dirigida de búsqueda/SEO/UI/analytics y revisión directa de seguridad, persistencia, scheduler y despliegue. **No es una revisión línea por línea de los 412 archivos ni certificación de cada scraper.**

| Área | Evidencia de este corte | Pendiente para cierre |
|---|---|---|
| Búsqueda, filtros, SEO y sponsors | Código, referencias y pruebas unitarias | Recorrido real tras estabilizar producción |
| Catálogo/scraping | Registro común, orquestación, logs reales del cron | Matriz de todas las tiendas, muestra precio/stock/URL por tienda |
| Auth y datos | Contratos locales y migraciones | Comprobar permisos/RLS efectivos con usuarios de prueba |
| Infraestructura | Worker activo, bindings sin valores, 503 público | CPU/memoria por invocación, cache hit rate, frescura agregada |
| Contenido | Plantillas, cambios locales y páginas priorizadas por GSC | Evidencia editorial/benchmarks de cada guía |
| Métricas | GSC actualizado | GA4 real, leads, clics salientes y facturación |

Unitarios: **115 archivos / 549 tests aprobados**. Lint aprobado. Build Next aprobado, pero advierte configuración local inválida de Redis y acceso fallido al historial Supabase; esto no verifica dependencias reales. No se ejecutó un despliegue ni build OpenNext publicable. Pruebas E2E focalizadas: ver `VALIDACION.md` para resultado final y límites.

## Plan de 90 días

Las fechas son objetivos de trabajo, no promesas de tráfico/ventas. Si un requisito previo falla, no se avanza a cobrar/publicitar un servicio sin evidencia.

| Periodo | Entregable concreto | Responsable | Criterio de cierre |
|---|---|---|---|
| 12–18 septiembre | Resolver 1102, aislar carga pesada, validar catálogo; corregir pageviews; activar contacto | Codex técnico + Jonathan canales/costos | Muestra pública estable, recepción de contacto y eventos de prueba correctos |
| 19–25 septiembre | Baseline de embudo y frescura; corregir stock/conteos; corregir las rutas E2E que fallen | Codex | Datos comparables por tienda/categoría y 7 ciclos de refresh útiles |
| 26 septiembre–9 octubre | Mejorar CPU/GPU y guía de 2 millones; plantilla comercial y lista de diez prospectos | Codex prepara, Jonathan valida oferta | Tres páginas revisadas y diez negocios con motivo concreto para encajar |
| 10 octubre–8 noviembre | Piloto de 30 días con 1–2 negocios; publicar dos piezas útiles por semana si hay evidencia | Jonathan relaciones; Codex medición/contenido | Reporte semanal, primer lead comercial calificado y decisión documentada del piloto |
| 9 noviembre–10 diciembre | Renovar o cambiar oferta según resultados; probar captación para armado/reparación | Jonathan | Caso real autorizado o descarte; consultas locales medibles; hasta tres trabajos pagados verificados antes de ampliar inventario |

Dentro del Comparador, máximo tres mejoras simultáneas. Primera tanda: disponibilidad/catálogo, medición, contacto. Lo demás permanece en backlog.

### SEO y contenidos que atraen compradores

1. Trabajar primero páginas con impresiones existentes: CPU, GPU y guía de dos millones. Separar intención “comparar rendimiento” de “comparar precios”; no atraer una promesa que la página no cumple.
2. Revisar título, explicación inicial y snippets con precios actualizados solo cuando se pueda sostener su frescura. Medir 28 días contra 28 anteriores, por familia de URL y posición.
3. Guías con componentes verificables, compatibilidad, fecha, fuente y enlace al precio actual. No inventar FPS/benchmarks; distinguir pruebas propias de fuentes externas.
4. Crear piezas que también ayuden al futuro servicio: qué revisar antes de ampliar RAM/SSD, compatibilidad de fuentes y GPU, diagnóstico inicial de PC lenta, checklist de armado y actualización. Cada pieza debe responder una pregunta concreta y enlazar a una acción útil.
5. Priorizar ayuda original, enlaces internos y citas verificables. No prometer visibilidad en IA por llms.txt ni tratar bloqueo de entrenamiento como bloqueo automático de búsqueda. Robots público incorpora reglas Cloudflare además de las del repositorio; no se verificó acceso efectivo de cada agente de búsqueda.

## Oferta inicial para sponsors

**Producto propuesto:** piloto de 30 días para una tienda argentina relevante, con espacio claramente patrocinado, enlace identificado y reporte de impresiones válidas, clics salientes y consultas atribuibles cuando exista acuerdo de medición. Máximo dos pilotos simultáneos.

El orden orgánico por precio se conserva independiente. No vender posiciones orgánicas, rankings favorables, backlinks SEO ni ventas garantizadas. Etiquetar los acuerdos y usar `rel="sponsored"` en enlaces comerciales externos según corresponda.

Hoy 256 clics orgánicos/28 días constituyen una audiencia inicial, no justifican por sí solos una tarifa de alcance masivo. No fijar precio inventado: primero validar volumen de derivaciones, categoría, entregables y disposición a pagar con conversaciones. Un piloto gratuito o reducido, si se elige, debe tener fecha final, entregables y decisión de continuidad; no trabajo indefinido.

Proceso: preparar diez prospectos → Jonathan aprueba destinatarios y mensaje → cinco contactos personalizados → hasta dos conversaciones → un piloto → evaluación a 30 días. No se enviaron mensajes ni se contrataron servicios en esta revisión.

Media kit mínimo: qué audiencia tenemos y periodo exacto; geografía; categorías con intención; ubicaciones disponibles; independencia; métricas ofrecidas; límites de atribución y contacto. No usar datos personales de visitantes ni estimaciones Semrush como sesiones reales.

## Contrato de métricas

| Indicador | Definición/fuente | Frecuencia | Regla de decisión |
|---|---|---|---|
| Salud pública | Status de portada + CPU + GPU + una ficha; registrar hora | Diaria | Confirmar segundo fallo con pausa antes de alertar; una recuperación también es cambio relevante |
| Refresh útil | Jobs y resultados por tienda, productos persistidos y última actualización | Diaria | Un job verde sin datos útiles no cierra el incidente |
| Frescura | % ofertas disponibles actualizadas ≤24 h, con denominador explícito | Diaria | Meta inicial propuesta ≥95% en la muestra prioritaria; no alcanzada todavía |
| Clics/CTR SEO | GSC Web, 28d contra 28d, página/consulta/país/dispositivo | Semanal | Investigar variación; no atribuir causalidad con pocos clics |
| Búsqueda sin resultados | Búsquedas completas con cero resultados / búsquedas completas | Semanal | Priorizar consultas repetidas y excluir errores de red del cero-resultados |
| Derivación a tienda | Sesiones con clic externo / sesiones elegibles | Semanal | Baseline primero; separar orgánico y sponsor |
| Rendimiento sponsor | Impresiones visibles, clics únicos por sesión/campaña, leads confirmados | Semanal | Renovar solo con valor y datos claros; clic no equivale a compra |
| Conversión comercial | Leads válidos, conversaciones, pilotos y renovaciones | Semanal | Responsable y próxima acción por prospecto |
| Armado/reparación | Consultas por zona → presupuestos → trabajos cobrados | Mensual al activarse | Validar mercado/geografía antes de unir embudos |

Taxonomía: conservar eventos existentes y añadir claridad para `outbound_click`, `view_promotion`, `select_promotion`, `generate_lead`, `search` y `view_item`. Incluir store_id, categoría, superficie, campaign_id y tipo de enlace donde corresponda. Migrar sin duplicar conteos; no sumar selección interna de producto y salida a tienda como una misma conversión. Minimizar texto libre y nunca enviar correos/teléfonos al analytics.

Objetivos iniciales de aprendizaje: 14 días de medición comprobada; tres páginas mejoradas y evaluadas; diez prospectos investigados; cinco mensajes solo tras autorización; un piloto. Objetivo direccional SEO: probar acercarse a 2,2% de CTR en una mezcla comparable durante 90 días. No es garantía ni sustituye controlar posición, demanda y cambios de páginas.

## Seguimiento

Revisión ligera diaria a las 10:00 de la zona del usuario; revisión de métricas/backlog los lunes en el mismo seguimiento. Avisar por cambio relevante, fallo nuevo, recuperación o decisión necesaria. Mantener silencio ante el mismo problema ya conocido. Si faltan sesiones o acceso, registrarlo sin inventar cifras ni pedir permisos repetidos.

Cada actualización debe registrar fecha de observación, periodo de datos, fuente, valor, cambio y decisión. Mantener histórico; no sobrescribir el baseline. Ver `BACKLOG.csv` y `METRICAS.csv`. El monitor no equivale a vigilancia 24/7 ni realiza despliegues, gastos, modificaciones de credenciales o contactos externos.

## Fuentes

- Search Console autenticado: https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fwww.comparador-hardware.com.ar%2F&num_of_days=28
- Ejecución fallida: https://github.com/john2k2/comparador-hardware-argentina/actions/runs/34685188331
- Cloudflare 1102: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/
- Google, SEO para funciones IA: https://developers.google.com/search/docs/appearance/ai-features
- Google, enlaces comerciales: https://developers.google.com/search/blog/2021/07/link-tagging-and-link-spam-update
- Sitio y contacto: https://www.comparador-hardware.com.ar/ y https://www.comparador-hardware.com.ar/contacto

Los informes locales GEO del 09/09 sirvieron como antecedentes, no como métricas actuales. No se modificó código de producción ni se revirtieron cambios ajenos.

## Corte de seguimiento — 13/09/2026

Fuente: solicitudes públicas espaciadas y ejecución `34751070154` de GitHub Actions. La portada, `/comparar/procesadores`, `/comparar/placas-de-video` y la ficha agrupada de Ryzen 5 5600 devolvieron **200**. Es una recuperación frente al incidente 503/1102 registrado el 12/09, aunque sigue siendo una muestra puntual y G01 permanece en observación.

El scheduler diario terminó correctamente con `source=public-demand`: actualizó un objetivo de memoria RAM, devolvió 11 productos y no reportó fallos. Es el primer corte posterior a la cola de demanda; G02 continúa en observación hasta reunir siete ciclos útiles y datos de frescura por tienda. No se consultaron métricas de GA4 ni Search Console en este corte diario.

## Corte de seguimiento — 14/09/2026

Fuente: solicitudes públicas espaciadas y ejecución `34833586162` de GitHub Actions. Se repitió la muestra de portada, categorías CPU/GPU y ficha agrupada conocida: **4 de 4** rutas devolvieron 200. El scheduler volvió a completar una demanda pública de memoria RAM, con cinco productos y cero fallos. No hubo un cambio material respecto del corte anterior; la observación de G01 y G02 continúa sin declarar cierre.

## Corte de seguimiento — 19/09/2026

Fuente: solicitudes públicas espaciadas y ejecuciones diarias `34955387440`, `35081657429`, `35207782530`, `35330375379` y `35434568720`. La portada, CPU, GPU y una ficha agrupada de Ryzen 5 5600 devolvieron **200**. No reapareció el 503/1102 en esta muestra.

El scheduler acumula siete ejecuciones diarias consecutivas exitosas desde el 13/09. Seis devolvieron productos; la del 19/09 procesó `rx 6600 xt` con 200 y cero fallos, pero obtuvo cero productos. Esto confirma estabilidad del mecanismo y selección por demanda, aunque todavía no cumple el criterio de siete ciclos útiles ni demuestra frescura por tienda. G01 y G02 continúan en observación; el próximo control debe distinguir éxito técnico, cobertura obtenida y actualización efectiva de precios.

## Corte de seguimiento — 20/09/2026

Fuente: solicitudes públicas espaciadas y ejecución diaria `35503079842`. Portada, CPU, GPU y la ficha agrupada conocida devolvieron **200**; la ficha redirigió a su URL canónica y terminó en 200. No reapareció el 503/1102 en esta muestra.

El scheduler volvió a seleccionar `rx 6600 xt` desde `public-demand` y terminó con 200, cero fallos y cero productos. Es el segundo ciclo consecutivo técnicamente sano sobre el mismo objetivo sin aportar catálogo. Esto ya requiere revisar por qué la demanda no se consume o rota cuando una consulta completa queda vacía; de lo contrario, los ciclos verdes pueden repetir indefinidamente un objetivo inútil. G01 sigue en observación estable y G02 permanece P0, ahora con evidencia de repetición que debe resolverse antes de contar ciclos útiles.

## Corte de seguimiento — 21/09/2026

Fuente: solicitudes públicas espaciadas y ejecución diaria `35589635629`. Las cuatro rutas críticas volvieron a responder **200**, sin señal de 503/1102.

El scheduler rotó el objetivo de `rx 6600 xt` a `rx 6950 xt`, por lo que no quedó fijado indefinidamente en la consulta anterior. Sin embargo, el nuevo objetivo también terminó con cero productos y cero fallos. La rotación es una recuperación parcial del riesgo señalado el 20/09, pero ya son tres ciclos consecutivos sin actualización útil. G02 permanece P0: el siguiente diagnóstico debe separar falta real de resultados, normalización de consultas y cobertura efectiva de tiendas antes de ampliar el cron.

### Revisión semanal de Search Console — 21/09/2026

Fuente: informe autenticado de Search Console actualizado cuatro horas antes de la consulta. Ventana completa 23/08–19/09 contra 26/07–22/08:

- Clics: **296 vs 192** (**+104; +54,2 %**).
- Impresiones: **14 mil vs 9,55 mil** (**aprox. +4,45 mil; +46,6 %**, con el periodo actual redondeado por la interfaz).
- CTR: **2,1 % vs 2,0 %** (**+0,1 puntos porcentuales**).
- Posición media: **8,4 vs 8,5** (**mejora de 0,1**).

Las consultas de comparación amplían alcance, pero el CTR todavía deja margen: `comparar procesadores` pasó de 487 a 776 impresiones y de 2 a 3 clics; `comparar placas de video` pasó de 113 a 315 impresiones y de 1 a 2 clics. La decisión es conservar CPU y GPU como páginas prioritarias para mejorar snippets sin cambiar títulos de nuevo antes de medir una ventana completa comparable.

El snapshot de indexación muestra **3.187 páginas indexadas y 326 no indexadas**. Aparecen **2 fragmentos de producto**, **1 ficha de comerciante** y **2 breadcrumbs** válidos, todos sin errores visibles. Es una mejora frente al baseline de cero resultados enriquecidos, aunque los conteos pequeños todavía no demuestran cobertura general. La portada también señala que `/guia` ganó 196 % de impresiones semana contra semana, mientras `/guia/pc-gamer-2-millones` perdió 100 %; se debe revisar demanda y elegibilidad antes de atribuirlo al contenido.

GA4 quedó verificado después de guardar todas las comunicaciones opcionales desmarcadas: 143 usuarios activos, 512 eventos y 178 `page_view` para 24/08–20/09. Search Console no está asociado a GA4; esta es una limitación de integración y no invalida la medición ya observada.

Segunda opinión Jev, consulta semanal acotada: recomendó priorizar CPU sobre GPU y la guía de dos millones con 91 % de probabilidad y confianza 0,87. Asignó solo 14 % a volver a cambiar ahora los snippets, coherente con esperar una ventana completa posterior a la modificación reciente. Su evaluación de preparación comercial tuvo confianza 0,09 y se descarta como base de decisión. La decisión operativa se apoya en Search Console: analizar primero CPU, mantener títulos por ahora y continuar solo con preparación interna de sponsors hasta verificar GA4 y clics salientes.

### GA4 y mensajes de Search Console — 21/09/2026

Se guardaron las preferencias iniciales de GA4 con todas las comunicaciones opcionales desmarcadas. El informe de 24/08–20/09 confirma **143 usuarios activos, 512 eventos y 178 `page_view`**. También registra 18 eventos `click` de 9 usuarios, pero el nombre genérico todavía no demuestra que todos sean salidas hacia tiendas. No aparece `generate_lead` entre los siete eventos observados. En los últimos siete días se ven 124 sesiones Direct, 9 de AI Assistant y 8 de Organic Search. G03 pasa a completado en producción; G07 conserva la validación pendiente de clic externo, dimensiones de tienda y `generate_lead`.

Search Console tenía 17 mensajes, 16 sin leer antes de la revisión. El aviso más reciente, del 20/09, añade `Página con redirección`; el informe muestra solo dos URLs en esa condición, por lo que primero deben revisarse los ejemplos antes de tratarlo como error. El aviso de sitemap del 16/09 sí señalaba un 5xx: `/guia/pc-gamer-2-millones`, detectada el 15/09 y rastreada por última vez el 18/09.

La comprobación pública confirmó que las tres guías de presupuesto devolvían 503/1102. La causa era una lectura de hasta 1.200 productos por cada una de siete categorías durante el render, hasta 8.400 filas. El commit `158a580` sustituyó esa ruta por una lectura máxima de 24 productos agrupados y comprables por categoría. Pasaron 16 pruebas, lint, build y smoke local; la versión Cloudflare `921e0f4b-1d01-4493-82b4-fa2c5359bc7b` dejó las guías de 1, 2 y 3 millones en 200. Search Console confirmó `Resultado de la validación: iniciada` el 21/09 para `/guia/pc-gamer-2-millones`. El siguiente control debe verificar el nuevo rastreo y el resultado final; la validación iniciada todavía no equivale a incidencia cerrada.

### Auditoría completa del menú de Search Console — 21/09/2026

Se revisaron Estadísticas, Rendimiento, Inspección de URLs, Páginas, Sitemaps, las tres clases de Retirada, Core Web Vitals, HTTPS, Fragmentos de productos, Fichas de comerciantes, Oportunidades para comercios, Breadcrumbs, Acciones manuales, Problemas de seguridad, Enlaces, Logros y Ajustes con sus informes de asociaciones, robots y rastreo.

La guía de dos millones conservaba en el índice el rastreo del 20/09 con 5xx. La prueba en tiempo real del 21/09 mostró `La URL está disponible para Google` y `La página se puede indexar`. La reparación ya es visible para Google, pero queda pendiente que el índice sustituya el rastreo fallido y cierre la validación.

El sitemap aparece correcto, con 29 páginas descubiertas y última lectura el 15/09. HTTPS muestra 31 URLs válidas y cero no HTTPS. No hay solicitudes de retirada en seis meses, acciones manuales ni problemas de seguridad. Core Web Vitals carece de datos CrUX suficientes tanto en móvil como en escritorio; no se interpreta como aprobación de rendimiento.

Google muestra dos fragmentos de producto válidos y una ficha de comerciante válida. `aggregateRating` y `review` son mejoras opcionales y no deben inventarse. En Merchant aparecen pendientes `shippingDetails`, `hasMerchantReturnPolicy` y un `sku` inválido; solo se añadirán políticas y datos que correspondan al rol real del comparador. Las 662 oportunidades de producto detectadas por Google son cobertura potencial, no tráfico, ventas ni inventario propio confirmado.

El informe de enlaces muestra solo dos enlaces externos y 7.751 enlaces internos. Los principales destinos internos siguen siendo URLs legacy como `/search?category=...`, junto con duplicidad visible entre `/about` y `/acerca`. G17 auditará los destinos canónicos y el reparto de autoridad interna antes de ampliar páginas o vender alcance a sponsors.

En rastreo se observan aproximadamente 16 mil solicitudes en 90 días, 97 % con respuesta 200 y 373 ms de respuesta media. El estado del host aún señala errores elevados de conectividad durante la semana anterior, coherentes con el incidente ya reparado. `robots.txt` fue obtenido, pero Googlebot ignoraba la directiva `Host` de la línea 13. El commit `d75a981` la eliminó; el build, la prueba focalizada y lint pasaron, y la versión Cloudflare `c00c30a7-e659-46f1-93f0-80b528a8da89` dejó el archivo público en 200 sin esa directiva.

Search Console no tiene ningún servicio asociado. Asociar la propiedad verificada de GA4 permitiría análisis conjunto, pero requiere seleccionar la propiedad correcta en la interfaz y se mantiene como acción externa pendiente de revisión. El control de IA generativa está heredado en `Incluir`, por lo que el sitio conserva elegibilidad para enlaces y tráfico desde funciones de IA de Google.

Prioridad comercial resultante: primero estabilizar rastreo e indexación y medir clics hacia tiendas; luego convertir las páginas con intención de compra en asesorías y presupuestos de armado; después presentar a sponsors argentinos un piloto medible. Merchant Center solo se evaluará cuando exista venta propia o un modelo de feed compatible con el rol real del sitio.

### Decisión Jev acotada — 21/09/2026

Pregunta: qué priorizar durante 14 días entre instrumentación y CTA, enlazado SEO, asociación GA4–Search Console, Merchant Center y contacto con sponsors. Jev eligió instrumentar el embudo y los CTA con 64 % y confianza 0,56. Como segunda prioridad eligió enlazado interno y rich results con 39 %, seguido de la asociación GA4–Search Console con 32 %; la confianza de este segundo orden fue 0,23, por lo que no se usa para excluir ninguna de las dos acciones.

Jev asignó solo 6 % a activar Merchant Center ahora y 26 % a comenzar contacto con sponsors antes de medir clics por tienda y leads. La confianza global quedó entre baja y media, 1,52 sobre 4. La decisión final se apoya además en GA4, Search Console y el código: G07 pasa a P0 y ejecución; G17 pasa a P1; asociar GA4 queda como acción corta dentro de medición. Merchant Center y outreach permanecen en espera hasta contar con modelo comercial, políticas y atribución verificables.

### Implementación G07 — 21/09/2026

Se instrumentó el recorrido de intención comercial con cuatro eventos diferenciados: `generate_pc_budget` al usar el armador, `select_advisory_cta` al pasar desde una guía, armado o ficha hacia contacto, `generate_lead` al abrir el correo de asesoría y `outbound_store_click` al salir hacia una tienda. Los clics externos ahora incluyen producto, categoría, tienda, posición, superficie, identificador de CTA, host de destino y tipo orgánico o patrocinado, sin correo, teléfono ni texto libre.

La propuesta visible es una revisión de compatibilidad, prioridades y presupuesto. No promete armado físico ni cobertura geográfica todavía. Se añadió en `/guia/armar`, guías por presupuesto, fichas de producto y `/contacto`. La versión `b9375fe3-3403-4c18-8edb-21edff29fbb5` quedó publicada y las rutas de armador y contacto respondieron 200 con el CTA. Compilación, lint y pruebas pasaron; la recepción real de los nuevos eventos en GA4 y una consulta recibida siguen pendientes, por lo que G07 continúa en implementación.

## Corte de seguimiento — 22/09/2026

Fuente: solicitudes públicas espaciadas y ejecuciones de GitHub Actions `35678031730`, `35678347841`, `35680116825` y `35712677571`. Portada, CPU, GPU y la ficha conocida de Ryzen 5 5500 devolvieron **200**; no reapareció 503/1102.

Hubo un fallo nuevo pero acotado en una ejecución manual: la consulta `ryzen 5600` limitada a Mexx, Venex y Maximus terminó en 200 sin productos y el workflow la marcó correctamente como fallo. Dos comprobaciones manuales posteriores por categoría procesadores terminaron bien, con 1.385 y 100 productos respectivamente. El scheduler diario encontró otra vez cero productos para `rx 6950 xt`, aplicó la recuperación prevista con `ryzen 5600` y obtuvo dos productos; el job terminó correctamente con advertencia explícita. Esto es una mejora material frente a los tres ciclos vacíos anteriores: el cron ya no queda verde sin aportar catálogo cuando la demanda falla. G02 continúa P0 porque todavía falta demostrar cobertura y frescura por tienda, y entender por qué esas consultas concretas quedan vacías.

## Corte de seguimiento — 23/09/2026

Fuente: cuatro solicitudes públicas espaciadas y ejecución programada `35845459548`. Portada, CPU, GPU y la ficha conocida de Ryzen 5 5500 devolvieron **200**. El scheduler terminó correctamente: la demanda `rx 6600 xt` no produjo artículos y el fallback `rtx 5060` informó 12 productos. Se mantiene el patrón recuperado ayer, sin un fallo nuevo ni evidencia suficiente para cerrar G02. `productCount` es la cantidad informada por el refresh; todavía no acredita frescura o cobertura por tienda.

## Corte de seguimiento — 25/09/2026

Fuente: cuatro solicitudes públicas espaciadas y ejecuciones programadas `35983951557` (24/09) y `36122266839` (25/09). Portada, CPU, GPU y ficha conocida de Ryzen 5 5500 devolvieron **200**. Ambos jobs finalizaron correctamente sin fallback: seleccionaron la consulta `procesadores` y cada uno informó 12 productos, cero objetivos fallidos. El resultado mantiene estable el servicio y evita las demandas vacías observadas antes. La repetición del conteo no demuestra por sí sola que hayan cambiado precios ni que todas las tiendas estén frescas; G02 continúa abierto.

## Verificación en Search Console — 25/09/2026

Fuente: propiedad autenticada `https://www.comparador-hardware.com.ar/`, informes y mensajes visibles. Google validó el 23/09 la corrección de **una URL con error de servidor (5xx)**. El detalle del motivo, actualizado el 20/09, muestra validación correcta iniciada el 21/09, sin errores detectados el 22/09 y **0 páginas afectadas**. Esto cierra la validación concreta de ese 5xx; no demuestra que todo posible fallo de servidor futuro haya desaparecido.

Apareció un aviso nuevo el 24/09 sobre el conjunto de datos del índice de precios: falta `license` en `/indice-precios-hardware`. Es **1 elemento válido, 0 inválidos** y una mejora no crítica. El JSON-LD contiene `Dataset` y distribución CSV, pero no se encontró una licencia pública definida para el dataset; elegirla requiere establecer los términos reales de reutilización antes de añadir una URL al marcado.

En Fragmentos de productos, informe actualizado el 23/09: **6 elementos válidos y 3 no válidos**. Los tres fallan porque el `Product` no tiene `offers`, `review` ni `aggregateRating`; ejemplos: una fuente Arkham 650 W, un SSD Sandisk 1 TB y una RAM Aimerican DDR5 16 GB. El constructor de JSON-LD omite ofertas cuando no hay precios recientes y comprables, pero sigue publicando `Product`. La corrección técnica candidata es no emitir ese marcado de `Product` cuando no exista una oferta verificable; no inventar reseñas ni disponibilidad. Las seis advertencias de `aggregateRating` y `review` sobre elementos válidos son opcionales.

Fichas de comerciantes: **3 válidas, 0 no válidas**. Persisten advertencias en las tres por `sku`, `shippingDetails` y `hasMerchantReturnPolicy`; una también tiene longitud de SKU inválida. Corregir el identificador verificable sí procede. Envío y devoluciones pertenecen a las tiendas de destino y no deben presentarse como políticas propias del comparador.

Oportunidades para comercios muestra **671 productos detectados** y propone configurar Merchant Center para la pestaña Shopping. Son productos descubiertos, no anuncios pagados, ventas ni inventario propio. Como la compra se completa en otras tiendas, se mantiene pendiente la decisión de elegibilidad y modelo comercial; no se inició Merchant Center ni campañas publicitarias.
