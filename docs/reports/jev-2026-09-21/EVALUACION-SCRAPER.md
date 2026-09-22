# ¿Conviene usar Jev como scraper?

Evaluación del 21/09/2026. Decisión para el piloto aprobado: conservar obtención y extracción determinista; incorporar Jev como evaluación selectiva de candidatos ambiguos. No hay evidencia de que reemplazar los parsers actuales por llamadas a Jev mejore velocidad o precisión general.

## Alcance técnico

La API actual recibe `state` y preguntas `choice`, `score` o `noul`. No ofrece una operación nativa para descargar una URL, ejecutar JavaScript de una tienda o devolver campos arbitrarios nuevos. El modelo acepta texto; no imágenes de la página.

Sí es posible construir un scraper guiado por Jev: nuestro código descarga la página, identifica textos, enlaces y montos candidatos; Jev elige entre ellos o clasifica sus propiedades; el código recupera el valor original elegido y lo valida. Esto permite, por ejemplo, seleccionar un precio de transferencia entre cuotas y precios de accesorios, o distinguir stock web de stock local.

También puede seleccionar un enlace entre URLs suministradas y dejar que el ejecutor lo abra después. Eso es navegación orquestada por nuestro software. No elimina el cliente HTTP, el navegador cuando sea necesario, la paginación ni el manejo de errores de acceso.

Fuentes: [API de TypeSafe](https://docs.typesafe.ai/api), [modelo e inputs admitidos](https://docs.typesafe.ai/models), [Choice](https://docs.typesafe.ai/primitives/choice).

## Medición de descarga y extracción

Se solicitó una página pública de producto por tienda, sin autenticación, cambios de sesión ni intentos de superar bloqueos. Después se repitió la extracción 15 veces sobre cada HTML local; no se repitieron las peticiones de red. La extracción usa Cheerio para cargar el DOM y obtener título, candidatos de precio y JSON-LD. Es una medición de estas operaciones, no un benchmark completo de todos los scrapers del proyecto.

| Tienda | HTTP | Descarga completa | Primera extracción local | Mediana de 15 extracciones locales |
|---|---:|---:|---:|---:|
| XT-PC | 200 | 2.083 ms | 25,19 ms | 2,82 ms |
| FullH4rd | 403 | 8.593 ms | 0,73 ms | 0,25 ms |
| MaxTecno | 404 | 14.198 ms | 14,68 ms | 8,09 ms |

Sólo XT-PC devolvió una ficha válida. Los tiempos de parsing del 403 y 404 corresponden a páginas de error y **no cuentan como extracción exitosa de productos**. Tres descargas no permiten caracterizar la latencia habitual ni el p95 de las tiendas.

La lectura local fue una fracción pequeña del tiempo de obtener la ficha válida. Añadir Jev no elimina la descarga; en un caso que ya resuelve el parser agrega una etapa. Los errores 403 y 404 tampoco se resuelven cambiando el modelo que interpreta el contenido.

Las mediciones, URLs y horas se conservan en `EVIDENCIA-SCRAPER-JEV.json`. Capturas HTML públicas y extracción original: `tmp/jev-scraper-eval-2026-09-21/`.

## Prueba de Jev

Se preparó una consulta con ocho decisiones: selección de precio anunciado, interpretación del canal de stock, suficiencia de evidencia de disponibilidad y cinco casos derivados de fixtures existentes de variantes y búsqueda.

La primera llamada tardó **745 ms** y consumió 2.149 tokens de entrada. Es el tiempo observado de una llamada completa a la herramienta MCP, con transporte y ejecución incluidos; no se midió la inferencia aislada ni una integración directa de API.

| Decisión | Resultado |
|---|---|
| Diferenciar ASUS Dual y TUF con el mismo chip | Variantes diferentes |
| Oferta RAM 6000 Venom bajo un título 7000 Xtreme | Variantes diferentes |
| Buscar 5600X cuando el modelo principal es 5600XT y el marketing menciona 5600X | Rechazo de coincidencia, con confianza baja de 0,40 |
| Buscar 5600X con título del mismo modelo | Coincidencia |
| Reconocer `TI S` como abreviatura de `Ti Super` | Coincidencia, confianza 0,64 |
| Texto de stock web disponible y local sin stock | El bloque declara disponibilidad web solamente |
| Stock verificado ante contradicción entre bloque y JSON-LD | Requiere verificación |
| Elegir precio de transferencia con impuestos | Abstención inicial |

Las cinco decisiones de variantes/búsqueda coincidieron con los contratos de fixtures considerados; las reglas existentes ya tienen cobertura para esos casos. No se demostró una ventaja incremental de Jev sobre esas reglas.

### La abstención y su seguimiento

El precio esperado era el candidato B, $866.390,04. La primera solicitud omitía el aviso explícito de IVA de la página y compartía contexto con datos contradictorios de stock/vigencia. Jev eligió `none` con confianza 0,80. No puede atribuirse una causa interna al modelo ni tratarse esa diferencia como un fallo inequívoco de extracción: la formulación mezclaba dos contratos.

Se realizó una sola consulta de seguimiento: tarea acotada a extraer el **precio anunciado**, excluyendo la decisión de comprabilidad, y agregando el aviso real de la página que dice que sus precios incluyen IVA. Jev eligió B con probabilidad y confianza 0,97. Esa llamada tardó **1.054 ms** y consumió 799 tokens de entrada.

Se conservan ambas consultas sin ocultar la abstención. El seguimiento es ajuste del mismo ejemplo, no una observación independiente ni parte de un benchmark ciego. Tampoco se atribuye el cambio únicamente al aviso de IVA, porque también cambió el alcance de la pregunta.

## Hallazgo sobre el stock de XT-PC

El bloque de producto diferencia explícitamente stock web y stock local. Sin embargo, el JSON-LD de esa misma captura declara `OutOfStock` y `priceValidUntil: 2020-02-24`. Esto prueba que no conviene tratar todo dato estructurado como correcto o vigente por defecto.

El scraper actual de detalle en `src/lib/scrapers/xtpc.ts` aplica `inferStock($.text())` a toda la página. Una mención a “sin stock” local puede dominar esa lectura aunque otro bloque declare stock web. La prueba con el HTML capturado devuelve `out-of-stock` por esa regla. Esto identifica una limitación de ámbito del parser; la disponibilidad real no se comprobó en checkout.

Jev interpretó mejor el alcance de los textos que esa regla global, pero las contradicciones de la fuente siguen exigiendo comprobación. Una regla por sección también puede resolver la distinción de canales. No hace falta usar IA para siempre una vez que el patrón de una tienda queda identificado y cubierto por pruebas.

## Velocidad y costo: qué se puede concluir

TypeSafe anuncia 70–500 ms y grandes mejoras frente a modelos que generan texto en tareas de decisión. Son comparaciones de su proveedor para esas tareas, no frente a Cheerio o a la descarga de tiendas. El anuncio reconoce que mide desde la costa oeste de EE. UU. y que parte de las ganancias mostradas favorece entradas cortas. [Presentación oficial](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

En nuestras dos llamadas de distinto tamaño se observaron 745 ms y 1.054 ms mediante MCP. No son una distribución de latencia ni permiten extrapolar una integración directa de producción. Tampoco corresponde calcular un factor de aceleración frente al parser: realizan operaciones diferentes.

El precio oficial consultado de Jev 1.13 es USD 0,042 por millón de tokens de entrada y salida sin cargo. Los 2.948 tokens de estas dos consultas equivalen aproximadamente a USD 0,000124 a esa tarifa. Es una estimación del componente modelo, no un cargo observado en la cuenta ni el costo total del servicio. Como escenario, 1.000 páginas de 2.000 tokens por consulta representarían USD 0,084 del modelo, antes de descargas, reintentos e infraestructura. [Tarifa y límites oficiales](https://docs.typesafe.ai/models).

## Comparación de enfoques

| Enfoque | Evaluación para este proyecto |
|---|---|
| HTTP/API más parser y validaciones | Base preferida para fuentes conocidas: rápido, reproducible y con trazabilidad |
| Jev como único scraper | No implementable con la interfaz actual: falta obtención de páginas y extracción abierta de valores |
| HTTP más Jev para cada oferta | Técnicamente posible con candidatos; agrega latencia y consumo sin mejora de precisión demostrada |
| HTTP más parser, con Jev selectivo | Mejor candidato para el piloto: revisar ambigüedades, detectar contradicciones y elegir entre candidatos ya observados |

## Decisión y ejecución del piloto

1. Aplicar HTTP/API y extracción por fuente, con validación de respuesta y de identidad. Un 403 queda bloqueado y un 404 queda fuera de comparación hasta resolver su destino; nunca se completa un precio ausente mediante IA.
2. Identificar por oferta precio anunciado, modalidad, impuestos, canal de stock y timestamp. Las fuentes en desacuerdo conservan estado pendiente. Separar extracción de un dato de autorización para publicarlo como vigente.
3. Enviar sólo los casos ambiguos a Jev, con candidatos que referencien el texto original, criterios versionados y opción de abstenerse. Validar el ID devuelto contra el conjunto ofrecido; copiar el dato desde la fuente, no desde texto generado.
4. Ejecutar inicialmente sin modificar resultados públicos. Separar los ejemplos usados para ajustar preguntas del conjunto de evaluación. Medir falsos emparejamientos, abstenciones, cobertura y latencia/costo por caso; comparar reglas solas frente a reglas más Jev.
5. Continuar con los presupuestos y la actualización a pedido sobre ofertas que cumplan los controles. La alta confianza del modelo no reemplaza la frescura, el stock observado ni la compatibilidad.

La evaluación solicitada está completada. El piloto amplio de 50 ofertas, los cambios del armador y el ciclo de revalidación siguen siendo trabajo de implementación aprobado, no resultados de esta prueba.

## Verificación

Pasaron 50 pruebas existentes en `product-identity`, `search-ranking`, `search-dedupe` y `budget-guide-pricing`. Eso verifica los contratos locales usados como referencia, no la exactitud del modelo ni el stock actual.

Esta tarea agregó evidencia y evaluación local. No cambió scrapers, base de datos, frecuencia de actualización ni despliegues.
