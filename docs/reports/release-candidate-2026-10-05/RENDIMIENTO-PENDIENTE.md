# Búsqueda general por precio · pendiente antes de publicar

> **Corte posterior: corregido el 06/10 UTC (05/10 en Santiago).** Se aplicó y verificó la lectura SQL: 15/15 RPC anónimas sin caché HTTP, 32/32 controles HTTP, dos recorridos de navegador, 16 suites SQL y dos concurrencias; TestSprite TC031 pasó con catálogo real en QA estricto. [Corrección y evidencia](../search-price-fix-2026-10-06.md). El resto de este documento conserva el diagnóstico histórico; la interfaz todavía no se publicó.

## Problema observado

Con el Worker construido en modo de producción, sin fixtures y con lectura anónima del catálogo real, `/api/search?minPrice=100000&sortBy=price-asc` devolvió 503 tras aproximadamente 8,9 segundos. El error registrado fue la cancelación por tiempo de la consulta `search_catalog_page`; no fue una validación de parámetros ni una respuesta inventada de stock.

La matriz HTTP conserva su resultado **31/32**, con este único fallo. La misma ruta en producción devolvió 200 desde caché obsoleta (`HIT-STALE`), y el Worker local posteriormente pudo devolver `DB-STALE`. Esos 200 prueban el fallback, **no** la recuperación de una consulta fría. La cobertura de diez casos públicos de navegador tampoco reemplaza esta comprobación general.

La definición SQL leída coincide con la migración existente de selección de precios actuales. No se estableció una regresión respecto de la versión pública: falta una comparación controlada sin caché con la base anterior. El fallo sí afecta un recorrido de compra del candidato y se conserva como impedimento para recomendar su publicación.

## Diagnóstico y alternativas descartadas

- El plan estimado exagera la cantidad de filas de dos helpers que producen como máximo una. La propuesta `ROWS 1` redujo esa estimación en una base local con 6.000 productos y 600 ofertas actuales, conservando exactamente resultados y permisos. El tiempo observado fue aproximadamente 32–33 ms en ambos casos: **no demostró una mejora de latencia**. Se retiró la migración del candidato; la propuesta permanece sólo como evidencia local sin aplicar.
- Dos variantes de consulta de sólo lectura, con selección canónica y candidatos frescos materializados, también agotaron los límites de 10–12 segundos en la base real. No se añadieron al código ni al esquema.
- Una muestra acotada de 25 recálculos atribuyó la mayor parte de su tiempo a localizar las filas, no al helper de precios. No permite atribuir el fallo global al proveedor semántico, a todo el catálogo, al hardware de la base ni a un índice particular.
- Las 13 regresiones SQL y dos escenarios de concurrencia se repitieron con las **70 migraciones originales**, después de retirar la propuesta. Aprobaron; son pruebas de corrección, no una prueba de rendimiento con el volumen de producción.

No se aumentaron timeouts, se prolongó la ventana de las ofertas, se renovaron observaciones o se aceptaron identidades pendientes para hacer pasar el chequeo. Los precios, stock y fechas de ofertas permanecieron intactos.

## Siguiente acción prioritaria

Obtener una medición acotada por fase de la consulta con el rol de lectura y el volumen reales: selección canónica, lectura de resúmenes, recálculo vencido, filtro/orden y conteo. La corrección debe mostrar resultados iguales —IDs, totales, rango y paginación— y una mejora medida antes de proponer una migración o cambio de lectura. Una prueba pequeña con datos sintéticos no basta.

La condición de aceptación es que la ruta general responda con ofertas elegibles, total y orden correctos **sin recurrir a caché obsoleta** y dentro del límite vigente, seguida por las consultas por categoría/tienda y las regresiones SQL. Cualquier cambio de base debe prepararse y probarse localmente, revisarse y recibir su autorización concreta antes de aplicarse. No hay una corrección SQL activa ni una aprobación de despliegue en este corte.

## Evidencia conservada

- `outputs/release-candidate-2026-10-05/public-workers-read/public-site.json`.
- `outputs/release-candidate-2026-10-05/global-range-reproduction.json`.
- `outputs/release-candidate-2026-10-05/global-range-plan-estimated.json`.
- `outputs/release-candidate-2026-10-05/local-cardinality-benchmark.json` y planes locales antes/después.
- `outputs/release-candidate-2026-10-05/database-final-regressions.log`.

Los informes locales no convierten ofertas observadas en ofertas comparables ni acreditan stock agotado. G02 conserva su criterio independiente de siete fechas útiles, muestra fija y frescura verificadas.
