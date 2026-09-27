# HardGamers: adquisición, utilidad y prioridades para el Comparador

Revisión: 21 de septiembre de 2026, hora de Argentina/Chile. Cierre de consulta: 22/09/2026 01:28 UTC. Alcance: navegación pública del competidor, Semrush, Search Console de nuestro dominio y revisión acotada del código local. No se publicaron cambios, no se crearon cuentas ni se contrataron servicios.

La base del producto alcanza para una primera versión útil: elegir piezas, comparar ofertas, armar un presupuesto, compartirlo y abrir las tiendas. El próximo esfuerzo debería concentrarse en precisión, adquisición y medición. Guardar varios presupuestos en una cuenta puede esperar.

## Estado del armador propio

La versión revisada es local. La activación pública del armador nuevo y la actualización a pedido siguen pendientes de los pasos de [IMPLEMENTACION.md](../pc-builder-2026-09-21/IMPLEMENTACION.md#activación-pública).

| Función | Evidencia local | Alcance real |
|---|---|---|
| Ir a la tienda | `PcBuilder.tsx`, enlace de cada oferta | Abre el comercio de la oferta seleccionada. |
| Compartir | `persistence.ts`, selección codificada en el enlace | Al abrirlo consulta los precios disponibles; no congela ni garantiza el precio. |
| Guardar y recuperar | `persistence.ts`, almacenamiento del navegador | Un armado local, en ese navegador; no una biblioteca sincronizada entre dispositivos. |
| Descargar | Presupuesto de texto con fecha y advertencias | Sirve como referencia del momento de descarga. |
| Actualizar ofertas | Cola y consumidor implementados | Requiere activación pública; tiene espera y puede terminar parcialmente. No anunciar actualización instantánea. |
| Medir uso | Existen `trackBudgetBuilder` y `trackStoreClick` | El nuevo `PcBuilder` aún no los conecta: faltan eventos de uso y de salida a tienda en ese flujo. |

Referencias: `src/components/pc-builder/PcBuilder.tsx`, `src/lib/pc-builder/persistence.ts`, `src/lib/analytics/ga4.ts`. El guardado en cuenta, múltiples presupuestos y sincronización quedan para una etapa posterior.

## Tráfico del competidor: estimaciones con fecha y alcance

[Semrush público, agosto de 2026](https://it.semrush.com/website/hardgamers.com.ar/overview/), actualizado el 18/09: **447.810 visitas estimadas**, 92,32% desde Argentina. El recorrido de escritorio atribuye 72,25% a directo y 18,62% a Google. Este último reparto no representa todos los dispositivos ni equivale al reparto de tráfico orgánico.

[Semrush orgánico](https://es.semrush.com/analytics/organic/overview/?q=hardgamers.com.ar&db=ar), consultado con sesión existente: Argentina, escritorio, corte 20/09/2026. Estima **65.660 visitas orgánicas mensuales**, 2.966 palabras clave, 50.700 de tráfico de marca y 15.000 sin marca. Son estimaciones, no Analytics del competidor.

| Entrada | Participación orgánica estimada |
|---|---:|
| Portada | 86,86% |
| `/stores/maximus` | 5,98% |
| `/stores/fullh4rd` | 1,04% |
| `/stores/venex` | 0,63% |
| `/stores/mexx` | 0,52% |

Las principales consultas visibles son variantes de HardGamers y Maximus. La evidencia favorece marca y páginas de tiendas; no demuestra que las guías o el armador sean sus principales fuentes de visitas. Estos porcentajes pertenecen al informe orgánico citado, no al total mensual de agosto.

## Nuestra demanda real

Search Console se volvió a consultar durante esta revisión. Propiedad `https://www.comparador-hardware.com.ar/`, búsqueda web, **23/08–19/09/2026**: **296 clics**, aproximadamente **14.000 impresiones**, CTR **2,1%**, posición media **8,4**. No comparar directamente estos clics con las visitas totales estimadas del competidor.

| Consulta, misma ventana | Clics | Impresiones |
|---|---:|---:|
| comparador de precios componentes pc | 16 | 90 |
| comparar precios componentes pc | 14 | 123 |
| comparar procesadores | 3 | 776 |
| comparar placas de video | 2 | 315 |

| Página, misma ventana | Clics | Impresiones |
|---|---:|---:|
| `/` | 207 | 3.217 |
| `/search?category=tarjetas-graficas` | 13 | 1.720 |
| `/guia/pc-gamer-1-millon` | 9 | 385 |
| `/guia` | 6 | 630 |
| `/search?category=motherboards` | 6 | 284 |
| `/comparar/procesadores` | 5 | 1.524 |
| `/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x` | 3 | 627 |
| `/guia/pc-gamer-3-millones` | 3 | 266 |
| `/guia/pc-gamer-2-millones` | 2 | 689 |

[Panel de Search Console](https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fwww.comparador-hardware.com.ar%2F). Las consultas de la tabla no suman necesariamente el total, entre otras razones por límites de visualización y consultas anonimizadas.

La ventana previa, documentada en [REVISION-Y-PLAN.md](../crecimiento-2026-09-12/REVISION-Y-PLAN.md), tenía 192 clics: el reporte registra un crecimiento del 54,2%. Se confirmó en vivo la ventana actual; el comparativo anterior procede de ese reporte. Su registro de GA4 tampoco debe interpretarse como una medición nueva de esta sesión.

## Qué tomar de HardGamers

Su [sitio público](https://www.hardgamers.com.ar/) conecta búsqueda, categorías, comercios y productos con una salida clara hacia la tienda. Conviene conservar esa sencillez. Las páginas de comercio merecen un piloto porque aparecen en las entradas SEO observadas.

Ya ofrecen [armador](https://www.hardgamers.com.ar/builder/custom), [bajadas de precio](https://www.hardgamers.com.ar/deals), guías y favoritos. Su [FAQ](https://www.hardgamers.com.ar/about/faq) describe historial y filtros por provincia. Son funciones esperables en la categoría; agregar sus nombres a nuestro menú no constituye una ventaja por sí mismo.

## Problemas reproducidos y oportunidades

**1. Un accesorio se acepta como CPU.** En una sesión temporal sin iniciar cuenta, abrir el [selector de procesadores](https://www.hardgamers.com.ar/builder/custom/cpu), ordenado por precio, mostró un pad térmico Carbice y un disipador Dell entre CPUs. Al agregar el pad, el armador lo colocó en Microprocesador, contó una pieza y sumó $18.352. Se retiró al terminar la prueba. Esto confirma un caso de clasificación incorrecta; no cuantifica el error de todo su catálogo.

Oportunidad: validar categoría e identidad antes de incorporar una pieza al presupuesto. En nuestro código, `fitsSlot` depende parcialmente de la categoría declarada y exclusiones de título; la lectura no encontró exclusiones explícitas para `thermal pad` y `heatsink`. Antes de anunciar una ventaja de precisión, incluir estos casos adversos y confirmar el comportamiento propio. No se ejecutó una prueba de ese caso sintético en esta revisión.

**2. La búsqueda exacta aún exige trabajo manual.** Buscar [RTX 5060 Ti](https://www.hardgamers.com.ar/search?text=RTX+5060+Ti) devolvió 513 resultados; el primer título visible correspondía a una RTX 5060 sin Ti. Los filtros visibles fueron precio, marca, tienda y provincia; no se encontró un filtro de VRAM en esa pantalla. No se verificó si el artículo discrepante tenía también una ficha comercial incorrecta.

Oportunidad: separar modelo, sufijo y capacidad; agrupar ofertas comparables y permitir filtros técnicos. Medir precisión sobre un conjunto acotado de consultas reales, además de cantidad de resultados.

**3. La guía de motherboards necesita actualización técnica.** La [guía revisada](https://www.hardgamers.com.ar/guides/mothers) generaliza que los chipsets Intel B no permiten gráficos integrados y presenta A320/B350/X370 como nuevos. La [ficha oficial de MSI B760](https://us.msi.com/Motherboard/B760-GAMING-PLUS-WIFI/Specification) declara salidas de video utilizables con un procesador que tenga gráficos integrados. También generaliza AMD como PGA, mientras [AMD documenta AM5 como LGA](https://ir.amd.com/news-events/press-releases/detail/1069/amdshowcases-industry-leading-gaming-commercial-and-mainstream-pc-technologies-at-computex-2022).

Oportunidad: guías breves, revisadas y fechadas, conectadas al catálogo disponible. Explicar socket, memoria, BIOS y costo completo con referencias de fabricantes. Los datos faltantes deben aparecer como pendientes. Evitar porcentajes de cuello de botella o FPS inventados.

**4. Costo total: hipótesis para validar.** En el flujo del armador examinado no se observó un cálculo de envíos por tienda ni una comparación automática entre comprar todo en un comercio y repartir compras. No se afirma que esta posibilidad no exista en ninguna otra parte del sitio.

Oportunidad: comparar ambas estrategias usando ofertas vigentes. Si falta el envío, mostrar subtotal y solicitar el dato; no asumir costo cero. Nuestro ingreso manual de envíos es una base, pero todavía no hay optimización automática de compra por comercios.

## Tres prioridades propuestas

### 1. Cerrar calidad y medición antes de promover el armador

Publicar la versión preparada siguiendo su plan de activación y comprobar el recorrido completo en el dominio real. Resolver la instrumentación del nuevo armador y validar la recepción de `outbound_store_click`, uso del presupuesto, compartir y resultado de actualización. Un clic a tienda no demuestra una venta.

Criterios: fechas originales visibles, conflictos excluidos, importes incompletos identificados, fallos de tienda sin renovar artificialmente la fecha y una muestra de 20 ofertas contrastadas con sus fuentes. Agregar casos de pad/disipador como CPU, GPU Ti/no Ti y capacidades distintas. La muestra sirve como comprobación inicial, no como certificación de todo el catálogo. Jev queda como apoyo para revisar coherencia; precio y stock requieren evidencia del comercio.

### 2. Captar las búsquedas con señal de demanda

Mejorar primero las páginas de procesadores, placas y guías de presupuesto que ya aparecen en Search Console. Conectar sus resultados con un armado editable y links a cada tienda. Revisar recuperación de las guías y absorción de las URLs legacy antes de crear variantes duplicadas.

Probar después tres páginas de tienda: Maximus, Venex y Mexx, elegidas según cobertura y frescura efectivamente disponibles. El código actual no tiene rutas SEO dedicadas por tienda: el footer y los patrocinados enlazan a `/search?stores=...`. El piloto debe ofrecer catálogo verificable, filtros, condiciones conocidas y fecha de revisión; páginas vacías o texto genérico no justifican indexación. FullH4rd queda como candidato si su cobertura real permite una página útil.

Ejemplos de próximas entradas: presupuesto de PC por monto, comparación de procesadores con precios actuales y ofertas de una tienda comparadas con otras. Su potencial propio debe medirse; no atribuirles volúmenes de búsqueda no consultados.

### 3. Facilitar que el presupuesto circule y genere regreso

Hacer visible compartir/copiar enlace y explicar que los precios se vuelven a consultar. Evaluar una presentación cómoda para WhatsApp y vista previa sin registro. Luego probar una selección de bajadas de precio con historial suficiente, stock y oferta concreta.

El precio anterior provisto por una tienda no basta para afirmar mínimo histórico. Los umbrales de 30/90 días deben depender de cobertura real del historial. Compartir presupuestos y ofertas útiles puede aportar distribución; no se midió todavía su efecto.

## Secuencia y decisiones

- **Primera semana de ejecución:** cerrar la prioridad 1 y registrar la base del embudo visita → uso del armador → salida a tienda. Sin recepción comprobada de eventos no evaluar conversión.
- **Segunda semana:** mejorar entradas existentes y preparar el piloto de tres tiendas, condicionado a la calidad del catálogo.
- **Semanas 3–4:** observar indexación, impresiones, clics no asociados a nuestra marca, presupuestos compartidos y salidas a comercios. Revisar una ventana comparable de 28 días; con poco tráfico, informar cantidades y no conclusiones de significancia estadística.

Expandir páginas cuando haya indexación y uso verificables. Si hay impresiones sin clics, revisar intención y presentación en resultados. Si hay entradas sin uso del armador, revisar catálogo y experiencia. Si hay armados sin salida a tienda, comprobar vigencia, disponibilidad y costos faltantes antes de sumar funciones.

Para después: cuentas con varios presupuestos, sincronización, favoritos y alertas personalizadas. Ya existen algunas tablas de favoritos/alertas; eso no demuestra que haya un flujo de usuario publicado y validado.

Este documento propone el siguiente alcance; no ejecuta el calendario ni activa monitoreos, migraciones, despliegues o publicaciones.
