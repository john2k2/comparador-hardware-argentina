# Medición de la demora inicial de búsqueda

La medición distingue la espera del catálogo, la caché y el procesamiento de resultados. El diagnóstico publicado en `f9ff292` permitió localizar el coste inicial en la lectura del catálogo. La evidencia pública antes y después debe conservarse por separado: el tiempo de una respuesta en caché no acredita la primera lectura.

## Interpretación

`database` mide la espera del consumidor. `catalog_rpc` mide la llamada completa del SDK; `catalog_headers` mide fetch hasta recibir Response y agrupa conexión, servicio y SQL. `catalog_body` mide text y decodificación, excluyendo JSON.parse. `catalog_transform` mide validación, conversión y guards del catálogo. La creación del cliente aislado queda dentro de database y fuera de catalog_rpc.

Los contadores `catalog_calls`, `catalog_reads`, `catalog_rereads` y `catalog_coalesced` usan desc numérico, no duración. Los consumidores coalescidos comparten el diagnóstico del productor: sumar catalog_calls de varias respuestas duplicaría el trabajo compartido. Los nombres son fijos; no exponen consultas, URLs, errores ni credenciales.

## Unidad de cambio y validación

Un único cambio agrega cliente de lectura aislado, captura de tiempos y propagación por coalescencia. Conserva el cliente habitual, el cliente de servicio, las reglas de frescura/stock/identidad, la paginación, la escritura observable de caché y los errores 503/429. Tests con el SDK instalado verifican transporte y Response, errores, callbacks fallidos y consumidores compartidos. La revisión independiente local no identificó fallos materiales.

La verificación local de aplicación y scripts pasó; hay un warning de lint previo ajeno a esta unidad. La publicación y los resultados de producción deben registrarse por separado. El criterio de cierre es medir consultas públicas sin respuesta en caché después de la corrección, conservando resultados y filtros. Una respuesta en caché o un test verde no acredita ese criterio.


## Consulta por ofertas actuales

La migración `20261010212131_prefilter_catalog_products.sql` identifica posibles ofertas actuales mediante los índices de observación y vigencia. Localiza sus identidades y después expande todas sus copias antes de aplicar el matcher completo y elegir la ficha canónica. Esta expansión evita que una copia reciente resucite una identidad cuyo canónico está vencido o fuera del rango. El filtro de nombre para consultas cortas se aplica únicamente cuando es una condición necesaria; RAM conserva su normalización y el matcher completo. Las búsquedas sin requisito de actualidad conservan el camino histórico.

Las búsquedas sólo por precio leen una vez el resumen y no cargan el JSON de ofertas cuando la estadística ya es válida. Se elimina de la proyección intermedia la lista de IDs que nunca se usaba; el armado final sigue comprobando las ofertas reales.

El índice de vigencia ocupa 1240 kB en el corte de producción del 10/10. Las comparaciones SQL sobre un mismo corte devolvieron JSON idéntico. Dos pares en distinto orden mostraron 118,8 frente a 469,4 ms y 813,3 frente a 2740,2 ms para candidata y original, respectivamente. La primera pareja expiró a los ocho segundos: estos datos acreditan reducción de trabajo, no un límite universal de latencia. Los buffers leídos desde disco y temporales fueron cero en los pares terminados.

Las pruebas `catalog_product_prefilter.sql` y `catalog_current_seed.sql` se ejecutan en CI sobre PostgreSQL 17. El harness `scripts/test-catalog-product-prefilter.mjs` crea su propio cluster local sin TCP ni credenciales del proyecto y verifica paridad de JSON, permisos, configuración, rechazo de cambios intermedios y reversión exacta. `catalog_product_prefilter.rollback.sql` es un procedimiento de reversión guardado: no es una migración para aplicar normalmente. Las guardas impiden reemplazar una función o un índice que hayan cambiado desde este corte.

## Proyección estrecha de búsqueda

`20261010222700_narrow_catalog_search_seed.sql` mantiene sólo ID, categoría y textos normalizados de componentes en `products_search_lookup`. Los triggers sincronizan esos campos dentro de la misma transacción que la ficha. Una observación que sólo cambia precios o fechas no reescribe esta proyección. El bootstrap se serializa con escritores, limita la espera por bloqueo a dos segundos y cada instrucción de construcción a treinta; un fallo revierte la unidad. Ese límite por instrucción no es un límite total de la transacción.

El seed textual consulta esa proyección y conserva el matcher, los precios reales y la preferencia canónica posteriores. El camino de precio sin texto consulta las mismas claves estrechas; para orden por novedades/relevancia sigue leyendo la fecha original. No cambia la ventana de 24 horas del catálogo ni la regla de tres horas de las guías.

La tabla permite sólo SELECT a los consumidores, incluido `service_role`; su mantenimiento ocurre mediante el trigger privilegiado de campos públicos. La prueba cubre las siete fuentes de texto, categoría, cambio de ID, eliminación y transiciones de componente. El cambio simultáneo de ID y tipo de producto elimina también la fila que pudo mover la FK. Se verifican títulos largos, incluidos los incomprimibles que rechazó una alternativa de índice descartada. Esa alternativa se retiró y no forma parte de las migraciones del repositorio.

El harness verifica 2.685 comparaciones de JSON contra la función previa a esta serie, 48 condiciones necesarias, casos de sincronización y permisos, guardas de modificación y restauración exacta. Las pruebas SQL de CI incluyen la nueva proyección. `catalog_search_lookup.rollback.sql` restaura la función 3fec y elimina únicamente la proyección derivada, después de comprobar sus guardas. Los tiempos de producción y el almacenamiento se registran en el artefacto de la intervención; esta documentación por sí sola no acredita el cierre de latencia.

## Corte público y límite pendiente

El 10/10/2026, la candidata 03f devolvió doce fichas en la segunda página de RTX. Con la respuesta compartida vencida, la descarga del documento completo tardó 2.942 ms en un corte y 4.635 ms en otro. La versión anterior a las optimizaciones había tardado 6.088 ms; la primera optimización sola, 7.314 ms. Son cortes de un catálogo que cambia, no un experimento de carga ni una garantía de tiempo máximo. El inicio del documento y la descarga de todos los resultados son medidas diferentes.

La búsqueda pública sólo por rango de precio devolvió respuesta sin caché en 3.257 y 1.769 ms; la repetición en caché tardó aproximadamente 170 ms. Las llamadas directas al catálogo mediante el rol anónimo y conexión TCP nueva tardaron 1.953 ms para RTX y 1.822 ms para precio en la primera vuelta; 275 y 239 ms en la siguiente. La demora inicial sigue abierta: estos datos acreditan una mejora parcial, no una primera búsqueda uniformemente rápida.

La proyección derivada ocupa 45 MB totales para 58.764 componentes en el corte de construcción. La base total ronda 1 GB decimal. El panel de infraestructura confirmó Nano con hasta 0,5 GB de memoria y organización Free; Usage señalaba 0,967 / 0,5 GB de cuota. El reporte de CPU/memoria no pudo cargar datos: no se atribuye la demora a saturación sin esa medición. Los controles locales PostgreSQL 17 con libc C e ICU en-US no reprodujeron los segundos de espera remotos; tampoco justifican cambiar la configuración o la ordenación del catálogo.

La evidencia de esta intervención queda separada en `outputs/demora-inicial-busqueda-2026-10-10/`. No se considera cerrado este punto ni se habilita avanzar con RAM, guías o AdSense por este corte. La siguiente decisión debe conservar las reglas de oferta y resultados, comprobar primeras consultas sin caché y explicitar el costo de infraestructura antes de contratar recursos.
