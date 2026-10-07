# Contratos que preserva la reducción de capacidad

Ingeniería Sol/high, sólo lectura sobre e3920df. El grafo de julio (1.987 nodos) sirvió como índice; las dependencias se confirmaron contra el código de octubre. Coordinación contrastó las funciones aplicadas y sesión UTC en Supabase a las 20:18 UTC. No se certifica un consumidor no encontrado como inexistente globalmente.

| Función | Datos y ventana | Condición antes de retirar |
|---|---|---|
| Bajaron de precio | price_history últimas 24 h, hasta 5.000, baseline por producto/tienda/URL y fallback NULL | Mantener identidad y observaciones necesarias; no sustituir por mínimos de catálogo |
| Ficha/chart de producto | Ficha consume Product/ofertas actuales; definiciones históricas sin caller encontrado | No adjudicarle una ventana pública de 365 d sin consumidor |
| Índice de hardware latente | RPC real 7–365 d, 90 predeterminado, más cotización previa; días Buenos Aires | Mantener carry-forward y último por día local o demostrar alternativa equivalente |
| Alertas de precio | price_alerts prioriza refresh; no evaluador de historia/notificación encontrado | No anunciar entrega de alertas ni borrar configuración del usuario |
| Guías/armador/comparación | products/product_prices actuales, hasta 3 h para total elegible | Preservar siete ofertas, variante, condición, stock y fecha real; editorial 10%, máximo personalizado exacto |
| Búsqueda/listados | products/product_prices/catalog_price_summaries, comparables 24 h y referencias | best_offers y estadísticas anteriores siguen siendo referencias; no son desecho |
| Retención histórica real | 14 d completos/90 horarios/365 diarios, último por bucket; sesión UTC | No confundir con medias/extremos ni con bucket Buenos Aires; no programada automáticamente |
| Paneles operativos | operational-store-event / operational-endpoint-event, 48 h | Retirar sólo vencidos, preservando renovaciones y contadores activos; límites 1.500/1.000 son de lectura |
| Protección de fuentes | store-scrape-circuit, 24 h | No quitar backoff vigente ni inferir stock de fallo |
| Demanda de refresh | catalog-refresh-demand, 14 d, contador puede leerse tras vencer | No incluirlo en purga de eventos; retirada cambia acumulación, no usuarios únicos |
| Eneba | eneba-affiliate-pilot, hasta 6 h desde feed real | Respetar fecha del feed y límite comercial del piloto |
| Normalización | product_title_normalizations, sin TTL DB | Edad no demuestra desuso; regenerar puede cambiar identidad y catálogo |

Referencias de código:

- src/lib/home/home-sections.ts:296 y price-drop-baseline.ts:29: consulta/baseline de bajas.
- src/lib/price-index/server.ts:17; supabase/migrations/20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql:38: serie y días locales.
- src/lib/persistence/product-read.ts:173; src/lib/seo/budget-guide-pricing.ts:50: guías/ofertas.
- supabase/migrations/20261006024548_current_catalog_bounded_candidates_function.sql:29: RPC de búsqueda.
- src/lib/server/shared-cache.ts:150: cache DB y borrado lazy protegido al visitar una clave; las consultas de eventos vencidos no pasan por allí.
- src/lib/metrics/storage.ts:44, recorder.ts:43, utils.ts:115: scopes, vigencia, claves únicas y límites de lectura.
- src/lib/server/cache-warming.ts:28: escribe homepage-v1/popular-products sin lectores encontrados; home actual lee homepage-v4. Corrección local pequeña posterior, sin cambiar esta unidad.
- src/lib/ai/normalize/index.ts:118: persistencia de normalizaciones.

Dos riesgos concretos del archivo por edad: una cotización antes del corte puede ser la semilla válida de una serie; dos observaciones 00:30/05:00 UTC caen en un mismo día UTC y días distintos de Buenos Aires. Mantener sólo la última diaria UTC puede eliminar la cotización del primer día local. El archivo exacto conserva registros, pero quitar originales exige comprobar esas consultas por separado.

Toda esta unidad conserva originales, consumidores e índices. El siguiente ensayo de historia necesita NULL/vacío/URLs separadas, empates, fronteras 14/90/365, observación previa y cruce de día local. No modificar umbrales de frescura ni denominadores para aumentar ahorro aparente.
