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
