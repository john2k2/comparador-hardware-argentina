# Catálogo: auditoría y correcciones — 01/10/2026

## Estado

Revisión agregada de la base activa zyiyziubpcpgoqlkcrie y trazado de extracción/persistencia. Corte de base: aproximadamente 17:00–17:10 UTC (14:00–14:10 Santiago). Publicaciones contrastadas en navegador: Mexx, MaxTecno y Katech. Se reprodujo la lectura de Katech con HTML descargado de su publicación.

Se implementaron en el checkout tres correcciones: buscador móvil, relevancia según ofertas utilizables y aislamiento del precio principal en detalle WooCommerce. **No están publicadas y la migración de ranking no está aplicada en la base activa.** No se actualizaron precios ni fechas de observación remotos, no se lanzó un barrido de tiendas ni se alteró el piloto G02.

## Base activa

| Medida | Resultado |
|---|---:|
| Registros de productos (no equivale a SKUs únicos) | 46.654 |
| Registros con ID agrupado | 26.040 |
| Fichas sin ofertas | 2.146 |
| Ofertas actuales guardadas | 60.781 |
| Observadas dentro de tres horas | 0 |
| Con observación anterior a 24 horas | 60.710 |
| Con stock in-stock/low-stock registrado | 47.636 |
| Con stock desconocido/nulo/no reconocido | 6.694 |
| Precio no positivo/no válido | 1 |
| Fecha de observación faltante/futura | 0 / 0 |
| Con cuotas registradas | 0 |
| Sin revisión de identidad registrada | 60.635 |
| Identidad consistent / needs-review | 20 / 126 |

El 99,88 % de las ofertas tenía más de un día. No se debe confundir vencimiento de frescura con agotamiento. “In-stock” guardado tampoco prueba disponibilidad actual: algunos adaptadores lo infieren por defecto y el valor puede ser antiguo. El único precio cero pertenece a una ficha histórica de Mexx fuera de stock; no se borró.

Última observación por tienda en el corte: CompraGamer aproximadamente 3,7 h, Mexx 3,7 h, MaxTecno/Katech y varias fuentes 5,4 h, Venex 53,7 h, FullH4rd 456,5 h, Gezatek 3.762,5 h. Se consultaron las 34 tiendas con ofertas guardadas. La cantidad de ofertas y el éxito de un workflow no acreditan una cobertura fresca.

La programación del repositorio prevé guías cada hora y muestra fija diaria. Los ocho runs recientes consultados terminaron success, pero sus inicios reales están separados por horas: 01/10 05:58, 11:31 y 13:19 UTC. Al corte no se demuestra cadencia horaria. La ejecución prioritaria de hoy registró 71 observaciones/26 productos, según el artefacto ya preservado en SEGUIMIENTO-DIARIO-2026-10-01.md; eso no renueva las 60.781 ofertas. G02 conserva su muestra, umbrales y cinco ciclos útiles registrados.

## Contraste de publicaciones y extracción

| Publicación | Valor guardado | Evidencia de la página |
|---|---:|---|
| Mexx ASUS RTX 5060 Dual OC EVO | $924.189 | $924.189 “Mejor Precio”; $1.256.889 precio de 12 cuotas; EN STOCK; P/N DUAL-RTX5060-O8G-EVO |
| MaxTecno Kingston 16 GB RGB | $402.184 | $403.489 efectivo/transferencia; $476.117 lista/total de tres cuotas; SKU IC_KF432C16BB12A/16; disponible en 24/48 h |
| Katech Kingston 16 GB | $150.412 | $385.890 efectivo/transferencia; $501.657 lista; descripción Black/CL22, sin RGB en el título |

Fuentes:
- https://www.mexx.com.ar/productos-rubro/placas-de-video/51108-placa-de-video-geforce-rtx-5060-8gb-asus-dual-oc-evo.html
- https://maxtecno.com.ar/producto/memoria-ddr4-kingston-16gb-3200-mhz-fury-beast-rgb-7976/
- https://katech.com.ar/producto/memoria-ram-16gb-ddr4-3200-kingston-fury-beast/

**Error reproducido en Katech.** El precio $150.412 está en una recomendación ADATA de 8 GB, no en la Kingston consultada. Ejecutando el parser de HEAD y el corregido sobre el mismo HTML actual: antes 150.412, después 385.890. La base vincula esa URL con una ficha canónica RGB, aunque el título y la descripción de la publicación contrastada no dicen RGB. La oferta conserva needs-review; no se la rehabilitó.

La diferencia de MaxTecno puede ser una variación entre cortes: no se atribuye a un parser incorrecto sin reproducción. En Mexx coincide el precio base, pero faltan las condiciones alternativas de pago. “Mejor Precio” se conserva como etiqueta de la fuente; no se deduce automáticamente su medio de pago.

## Problemas del recorrido de datos

1. **Precio contaminado por relacionados (confirmado y corregido en código).** El detalle Woo buscaba bdi/ins de precio de forma global. Ahora limita las fuentes a bloques principales y excluye relacionados, upsells, cross-sells, grillas y listas de productos; reconoce product_field.price de Katech. Si no hay importe principal ni metadato de producto, devuelve null. Mantiene el selector principal de SCP para no tomar precio sin impuestos.
2. **Stock inferido (confirmado en código; impacto individual pendiente).** Mexx empieza en in-stock si hay precio positivo y el título no dice sin stock. Cards Woo usan precio positivo y ausencia de clase outofstock. Venex y el detalle Woo son más conservadores. Falta distinguir stock explícito, botón de compra habilitado e inferencia, y guardar la evidencia.
3. **Pago incompleto (confirmado).** Adaptadores revisados no registran cuotas/condiciones. CompraGamer compara precioEspecial; la UI genérica carece de esa procedencia. Un único número pierde transferencia, lista, tarjeta, total de cuotas e impuestos incluidos/excluidos.
4. **Heurística de cuotas frágil (confirmada en código; no se atribuyó a un precio persistido concreto).** parseLocalizedArsPrice descarta montos pequeños por un umbral de $100.000 y toma el mínimo del resto; una cuota mayor puede confundirse con el total. Debe extraerse por bloque y etiqueta, no por magnitud.
5. **Identidad incompleta.** Solo 146 ofertas tienen dictamen registrado. La ausencia de revisión conserva el contrato actual, pero no prueba equivalencia. El diagnóstico G02 ya documenta pérdida de aceptación por reevaluación semántica y casos de EVO/Advanced/ICE. Debe distinguirse identidad comprobada por referencia/atributos de una confianza semántica.
6. **Fechas con significados distintos.** Product.updatedAt puede renovarse al construir/mapear un resultado; catalog-metadata lo usa como lastScrapedAt. La oferta conserva lastUpdated cuando se reutiliza el catálogo de CompraGamer, pero persistencia usa now como fallback para fechas ausentes/invalidas. Riesgo de fabricar frescura cuando se pierde la fecha de origen; no se probó un registro concreto artificial en este corte.
7. **Estadísticas y disponibilidad distintas.** Resumen SQL y estadísticas generales admiten stock unknown y no aplican toda la revisión de identidad; las tarjetas exigen stock explícito y revisión utilizable. La nueva relevancia corrige el orden para las revisiones registradas antes de paginar; no rediseña aún estadísticas ni garantiza que el guardado original represente una oferta equivalente.
8. **TiendaNube con variantes.** inferTiendaNubeStockFromVariants usa la primera variante; es necesario vincular variante, SKU, precio y stock. No se contrastó en esta revisión una publicación de TiendaNube con múltiples variantes.

Rutas para implementación:
- src/lib/scrapers/mexx.ts:71
- src/lib/scrapers/woocommerce-shared.ts:141 y parseWooProductDetail
- src/lib/scrapers/tiendanube-shared.ts:101
- src/lib/scrapers/compragamer-mapper.ts:256
- src/lib/persistence/product-catalog.ts:84 y 296
- src/lib/catalog/catalog-metadata.ts:50
- src/lib/price-utils.ts:parseLocalizedArsPrice y computeComparableStorePriceStats
- src/lib/quality/offer-identity.ts:needsIdentityReview
- docs/reports/crecimiento-2026-09-12/G02-DIAGNOSTICO-IDENTIDAD-2026-10-01.md

## Correcciones implementadas y comprobadas

- Portada: buscador antes de texto largo/categorías. A 360×800 pasó de y=834 a y=306, borde inferior y=350; escritorio conserva panel lateral.
- Ranking: orden de relevancia fresca utilizable → referencia antigua utilizable → ninguna oferta utilizable. Precio heredado sin ofertas no basta. El fallback y las tarjetas comparten isComparableStoreOffer. SQL verifica stock explícito y revisión registrada vinculada a nombre/categoría/URL, y calcula fecha de oferta antes de LIMIT/OFFSET. Los órdenes explícitos conservan su comportamiento.
- Cache de búsqueda: versión catalog-v4 para evitar reutilizar páginas con orden viejo.
- Woo: precio principal independiente de montos en recomendaciones; dos regresiones y reproducción del HTML real de Katech.
- Migración preparada: supabase/migrations/20261001165114_rank_search_by_usable_offers.sql. Funciones security invoker, search_path explícito; helper sin lecturas de datos y permisos de ejecución acotados a los roles actuales. No cambia RLS, tablas, precios ni stock.

Verificación:
- TypeScript y lint de archivos tocados sin errores.
- 132 pruebas unitarias en 16 archivos aprobadas.
- E2E: portada 375 px y matriz 360×800, 384×832, 412×915, 432×960; buscador/botón completos en primera pantalla, sin desborde y navegación de búsqueda aprobada.
- SQL local UTF8: copia de 692 productos/1.312 ofertas relacionadas con 5060; 323 resultados conservados, primeros resultados pendientes desplazados, órdenes precio asc/desc/nombre/newest idénticos al baseline y páginas 1–2 sin solapamiento. Prueba con rol anon aprobada. Latencia local con proceso cliente incluido: relevancia 37→32 ms en una muestra; no es una medición de producción.
- supabase/tests/search_usable_offers.sql: aprobaciones, pendientes, URL/nombre/categoría distintas, precio inválido, stock desconocido y revisión dañada.
- Compilación Next final posterior al cambio Woo aprobada.
- Captura: /tmp/comparador-home-corregida-360-20261001.png.
- SQL base de pruebas y resultados locales: /tmp/comparador-search-validation-20261001.json. Base temporal aislada apagada al finalizar.

El asesor de seguridad consultado antes de publicar informa avisos preexistentes: pg_trgm en public (https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), protección de contraseñas filtradas deshabilitada (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) y tablas RLS sin políticas, con acceso negado por defecto (https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No se cambiaron permisos de autenticación ni esas tablas.

## Seguimiento que falta implementar

Reutilizar el monitoreo existente, sin crear otro calendario ni ampliar el barrido automáticamente:

1. Por tienda: última ejecución/observación útil, intentos, publicaciones observadas, porcentaje explícito de stock, precios aceptados, frescura 3 h/24 h y razones de descarte. No usar success del workflow como cobertura.
2. Por oferta: URL y referencia de publicación/SKU, modelo/variante/capacidad/kit, precio y moneda, condición de pago, origen del stock, instante real de observación y resultado de identidad. Guardar por separado lista, transferencia, total/cuota/cantidad; no calcular condiciones no informadas.
3. Separar intento fallido de una observación anterior válida. Nunca renovar fecha en un fallo o por reconstruir una ficha.
4. Observaciones verificables también cuando el precio no cambie; price_history de cambios no reemplaza el registro de cobertura.
5. Reparar identidad y extracción antes de revalidar las ofertas afectadas. Empezar por fuentes/componentes más usados y la muestra vigente; mantener límites y ventana de tres horas.
6. Validar contra páginas reales por adaptador, incluyendo producto sin precio, stock ausente, varias variantes, relacionados, impuestos y cuotas mayores a $100.000.

No se declara una auditoría física completa de las 60.781 publicaciones ni una reparación global del catálogo. La base se midió entera; la interpretación de fuentes se inspeccionó por familias y tres publicaciones reales.
