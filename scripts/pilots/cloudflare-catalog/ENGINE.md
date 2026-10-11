# Lectura de búsqueda del piloto

El motor conserva la búsqueda de candidatos y sus matchers. Después del matcher,
una consulta calcula el total, limita la página e hidrata las fichas y sus ofertas.
`eligible` materializa sólo las ocho columnas necesarias para conteo y orden,
una vez por esa consulta. Las ofertas se leen por el índice de producto para un
máximo de 48 fichas de la página, con el mismo orden precio/tienda/URL.

Esto reemplaza cuatro consultas seriales finales por una. Los marcadores del
Worker, la evidencia opcional de ofertas y los lotes del matcher se conservan.
No requiere un cambio de esquema ni escrituras en el catálogo.

## Contratos

- Identidad preferida antes de aplicar frescura; nunca sustituir una ficha
  canónica vencida por su copia sólo para hacerla elegible.
- Conservar filtros, ranking, precio comparable, descarte de outliers y JSON
  original de cada publicación, incluida su fecha real de observación.
- Una página fuera del rango se ajusta a la última página. Cero resultados
  conserva `totalPages: 0`, `page: 1` y `products: []`.
- Una ficha sin ofertas conserva `product_prices: null`.
- Los candidatos conservan lotes de 2.000 y límite de 42. Si no terminan,
  `CATALOG_CANDIDATE_BUDGET_EXCEEDED` evita devolver totales truncados.
- Todos los valores externos son bindings; el tamaño de página interpolado
  está validado como entero entre 1 y 48.

## Verificación local del 11/10/2026

Paridad exacta contra `engine.mjs` de HEAD `3e4edb7`: 108 comparaciones JSON,
54 en cada copia SQLite abierta con `readOnly: true`. Cada copia usa un reloj
dentro de su intervalo certificado, y repite los casos con `forceOriginal`.
La matriz reproduce las 16 búsquedas de la medición previa del piloto y añade
RAM, tiendas, rangos, orden, páginas fuera del rango y resultados vacíos.

| Copia | Productos / ofertas | Consultas antes → después | Tiempo SQLite total antes → después |
|---|---|---|---|
| Muestra | 1.012 / 1.366 | 252 → 90 | 254 → 227 ms |
| Completa | 59.692 / 73.827 | 270 → 108 | 7.075 → 5.099 ms |

Evidencia privada: `outputs/cold-search-2026-10-11/parity.json`, capturada
a las 22:48 UTC. Son tiempos de una ejecución secuencial en la Mac: no miden
CPU del Worker, latencia de red ni filas leídas en D1. El orden antes/después
puede favorecer la caché de SQLite del segundo lector. Ambas copias terminaron
con `PRAGMA integrity_check = ok`.

Pruebas: 18 de motor/proyección y 16 de sincronización incremental pasaron.
ESLint de los dos archivos modificados y `git diff --check` sin errores.
El mayor agregado de ofertas de la copia completa ocupa 39.728 bytes, para
44 ofertas; el límite de respuesta y CPU remoto debe comprobarse en el piloto.

## Verificación remota, misma muestra

Dos cortes consecutivos sobre los mismos 1.012 productos/1.366 ofertas, antes de admitir las RAM: 48/48 respuestas JSON idénticas en cada corte, con 16 MISS y 32 HIT. Las consultas de MISS bajaron de 6–7 a 3–4; HIT conserva una consulta/una fila leída. La versión de caché pasó de 2 a 3 para separar respuestas del motor anterior.

Filas D1: 72.173 → 58.192 (19,4% menos). Latencia media MISS: 1.100,48 → 875,18 ms (20,5% menos). El peor MISS fue 2.061,18 ms, superior a los 1.433,47 anteriores; la media de las 48 respuestas también empeoró de 486,89 a 669,98 ms. Es una mejora del promedio inicial en este corte, no evidencia de que toda la experiencia sea más rápida o estable. CPU y cuotas requieren seguimiento independiente.

Evidencia privada: `outputs/ram-integracion-frio-2026-10-11/performance-comparison.json`. Revisión independiente: 240 casos de paridad en memoria y 34 pruebas de motor/proyección/sync, sin hallazgos abiertos. El dominio publicado conserva su despliegue anterior. Revertir `engine.mjs`, sus pruebas y el namespace de caché restaura el lector previo sin revertir ofertas.

La verificación visual posterior añadió un pico de 9.596 ms y una conexión Node que venció sin respuesta HTTP. La repetición separada directo/puente dio MISS 820,73 ms y HIT 144,78–307,53 ms; no permite asignar el pico anterior al motor. El puente conserva tiempos remotos/locales y códigos de transporte para el siguiente diagnóstico, sin token ni headers de autorización. Detalles y límites en `docs/direccion/RAM_INTEGRACION_BUSQUEDA_FRIA_2026-10-11.md`.
