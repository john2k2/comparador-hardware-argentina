# Cuatro ofertas RAM en el piloto privado

La admisión es una operación única, autenticada y limitada a cuatro IDs, cuatro productos y tres MPN CompraGamer. No admite ampliación general del catálogo. El entrypoint `remote-ram-worker.ts` inyecta el mismo gate de calidad que el consumidor local; el entrypoint sin verifier rechaza la admisión.

## Comprobación antes de escribir

El cuerpo máximo es 128 KB. Se verifica SKU/ref/URL, precio positivo, stock comparable, observación real de hasta tres horas y prueba fabricante concordante con nombre/specs actuales. Cada producto tiene exactamente una oferta y bases histórica/actual coincidentes. Resumen, mínimo, máximo, promedio, URLs, canon y próxima transición se derivan de esa oferta. Se conserva el JSON del producto; los términos de búsqueda se enriquecen sólo en metadata privada derivada.

El lote D1 exige marcador y conteos anteriores idénticos, tienda existente, IDs ausentes y ausencia de otra ficha con la misma identidad. Inserta productos/FTS/ofertas/bases/resúmenes/proyección y cambia el marcador en una sola transacción. El intervalo de caché no puede superar el previo ni la transición nueva más próxima. Una respuesta perdida exige comprobar marcador/recibo; no reenviar a ciegas.

## Ejecución y verificación del 11/10

Worker `catalog-search-free-pilot-20261011`, versión `1d02d1fe-4d89-4a77-9061-d93c2c7e7554`, sin dominio público. Admisión HTTP 200, cuatro productos/ofertas, 3.478 lecturas y 95 escrituras D1. Muestra 1.016 productos/1.370 ofertas; los 1.366 registros previos quedaron idénticos al admitir. El checkpoint se sustituyó sólo tras confirmar el marcador remoto. Diez búsquedas positivas/negativas pasaron y las cuatro filas D1 coincidieron byte por byte con SQLite.

Pruebas: `node --test scripts/pilots/cloudflare-catalog/ram-admission.test.mjs` (9/9); compilar `remote-ram-worker.test.ts` con esbuild ESM Node/paquetes externos y ejecutar Node 26 (10/10). Cubren falta/contradicción de SKU, título cambiado, proof inválida, derivados distintos del precio, alcance ampliado, transición de caché y rollback del lote.

Reversión: restaurar entrypoint/handler previo deshabilita nuevas admisiones, pero no retira filas admitidas. Las copias privadas previas y el outbox confirmado conservan el corte íntegro. Revertir datos requiere una operación explícita sobre toda la cohorte derivada y su marcador, coordinada con checkpoint/ciclo; nunca restaurar sólo las cuatro filas de precio ni sólo el marcador. La página publicada no participa de esta operación.

La vista loopback deriva el tamaño actual de muestra, encola CompraGamer sin volver a incluir FullH4rd y muestra la observación en Argentina/24 h. La prueba visual identificó la DDR5 correcta, precio especial $428.000, in-stock y fecha 20:04:21. Revertir puente/UI es independiente de revertir el Worker y los datos.
