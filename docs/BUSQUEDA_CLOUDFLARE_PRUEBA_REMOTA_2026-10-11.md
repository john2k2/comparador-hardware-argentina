# Búsqueda y actualización: prueba remota gratuita del 11/10/2026

Se comprobó una **muestra aislada** en Workers y D1 dentro del plan Free, confirmado en el panel de la cuenta. No se contrató nada ni se cambió la página publicada. El piloto quedó **pausado** al cerrar la medición: `PILOT_ENABLED=0`, sin cron, rutas del sitio ni acceso a Supabase. Su base se conserva para la siguiente prueba; el token generado se retiró del disco local y el puente privado de esta ejecución se detuvo. Reanudar requiere habilitación explícita, un vencimiento nuevo, comprobar el presupuesto restante y rotar el secreto del piloto.

## Resultado medido

| Evidencia | Resultado | Alcance |
|---|---:|---|
| Muestra importada | 1.012 productos, 1.366 ofertas, 34 tiendas, 10 familias | Selección del catálogo público; no cobertura total |
| Coincidencias remotas contra dos caminos locales | 96/96 respuestas | Antes y después del refresh, 16 casos × 3 repeticiones × 2 rondas |
| Importación inicial | 23.229 escrituras D1 | Datos e índices, meta real de D1 |
| Delta de dos ofertas observadas | 47 escrituras, 41 lecturas D1 | 9 statements atómicos; sin cola ni historial privado |
| Consumo agregado de D1 | 244.743 lecturas, 23.276 escrituras | Corte del proveedor 13:49 UTC; puede tener demora de agregación |
| Worker | 142 solicitudes, 0 errores registrados | Corte del proveedor; controles de pausa posteriores no incluidos |
| CPU | P50 1,099 ms; P99 10,224 ms | Microsegundos del proveedor convertidos a ms; corte anterior P99 13,063 ms |
| Caché HIT | 1 fila, 1 consulta D1; mediana 166 ms desde Mac | 64 respuestas del conjunto final |
| Caché MISS | Mediana 1.094 ms desde Mac | 32 respuestas; 13–12.151 filas según búsqueda |

No confundir costo por consulta, tiempo de base, CPU y tiempo de ida y vuelta. Hubo respuestas lentas: hasta **23.298 ms** en HIT y **8.415 ms** en MISS. En el HIT más lento, el servidor informó 140 ms y D1 0,29 ms. La diferencia queda sin causa demostrada: puede incluir transporte o ejecución del cliente y requiere una prueba controlada. No se eliminó ese dato del resultado ni se declaró velocidad estable.

El límite nominal de Workers Free es 10 ms de CPU; esta muestra ya tuvo percentiles que lo superan. No se observó un error 1102 en el corte, pero eso no demuestra capacidad para el catálogo completo o tráfico real. D1 Free admite 5 millones de filas leídas y 100.000 escritas por día, con escrituras de índices incluidas. Ver documentación oficial de [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/) y [unidades de CPU en Analytics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/).

La copia completa de origen contiene 59.692 productos. Su carga estimada supera 425.000 escrituras antes de completar todos los índices. No entra en un día gratuito: requiere carga repartida, reducción del diseño y un presupuesto que incluya importación, proyección, actualización y mantenimiento. La proyección local estimaba 11.137 escrituras; D1 midió 4.133. Las estimaciones locales no son facturación real.

## Actualizar no equivale a volver a buscar

La búsqueda responde con la observación guardada y su fecha original. El puente local probado encoló IDs conocidos, deduplicó la demanda y seleccionó destinos permitidos. El consumidor de la Mac se ejecutó manualmente, leyó dos publicaciones de MaxTecno y verificó precio, stock y atributos de CPU antes de guardar. El publicador envió sólo los cambios corroborados a la muestra de D1, con guardia de generación e invalidación de caché. Se rechazó un reenvío antiguo con HTTP 409, sin sustituir la generación nueva.

| Fuente observada | Precio observado | Stock | Fecha UTC |
|---|---:|---|---|
| [MaxTecno: Ryzen 7 8700G, 4.2 GHz](https://maxtecno.com.ar/producto/procesador-amd-ryzen-7-8700g-4-2ghz-am5-ddr5/) | $484.957 | in-stock | 11/10/2026 13:32:26.863 |
| [MaxTecno: Ryzen 7 8700G, 16 MB](https://maxtecno.com.ar/producto/microprocesador-amd-ryzen-7-8700g-16mb-4-2ghz-socket-am5/) | $525.866 | in-stock | 11/10/2026 13:32:29.579 |

Son observaciones puntuales, no garantía posterior. La página de fuente redondeó decimales del precio anterior; no se atribuye esa diferencia a un movimiento de mercado. El recibo real registró dos HTTP, 540.110 bytes y 3.701 ms. Una segunda ejecución inmediata intentó cero ofertas y generó cero HTTP. Buscar no rejuvenece precios. Errores, stock desconocido, backorder o identidad insuficiente conservan la fecha anterior o excluyen la oferta comparable.

El mismo Ryzen aparece en fichas separadas con IDs históricos de categorías distintas. Se corroboró el modelo y atributos de CPU, pero empaque, cooler y condición quedaron sin prueba explícita en estas fuentes. No se fusionaron indiscriminadamente: falta resolver esa identidad y decidir si son variantes comparables. Coincidir con el motor anterior no prueba que su agrupación sea correcta.

La cola automática funciona sólo a través del puente privado de esta muestra; el lector y la publicación incremental fueron invocaciones manuales. **No existe todavía un servicio continuo que mantenga todas las tiendas actualizadas.** Si la Mac se apaga, deja de observar. Los productos que todavía no existen en nuestra base necesitan un proceso separado de descubrimiento e inventario; buscar sobre una copia no los crea.

## Verificación y pendientes para avanzar

- 84 pruebas del piloto aprobadas sin omisiones, incluyendo oráculos de PostgreSQL/catálogo habilitados; 9 pruebas del consumidor aprobadas. Typecheck aprobado sin suppress ni exclusiones.
- Dos rondas finales de paridad remota con categorías españolas no vacías, consulta inexistente, texto corto, filtros de precio/tienda, orden y paginación. Los controles iniciales con nombres de categorías inválidos se corrigieron y no cuentan como cobertura de familias.
- El navegador mostró ambas fechas nuevas y conservó como histórica una oferta vieja. Evidencia: `outputs/cloudflare-remoto-gratis-2026-10-11/ofertas-renovadas.png` y `plan-gratuito.png`.
- Los seis Workers existentes conservaron `modified_on` y `etag`; sólo se agregó el piloto. La versión de producción siguió con fecha `2026-10-10T22:55:51.363775Z` y etag `65a4409c5771aab6f53a38e9b601d8fa290cde627d6be4b84dbbb1f02fe2cb2e`.
- Los controles finales de pausa respondieron `PILOT_STOPPED` antes de leer D1.

Prioridades pendientes: localizar las demoras extremas y reducir CPU; presupuestar/importar el catálogo completo por etapas; corregir agrupaciones con pruebas de variante; ampliar lectores y descubrimiento; operar un consumidor continuo con backoff y cuota diaria real. Recién después corresponde evaluar el cambio del buscador publicado. Guías y AdSense siguen fuera de esta prueba; su ventana comprable de tres horas no se amplió.

Evidencia numérica completa en `outputs/cloudflare-remoto-gratis-2026-10-11/`: `graphql-consumo-final.json`, `benchmark-confirmado.json`, `benchmark-despues-refresh.json`, `real-refresh.json`, `real-delta-remote.json`, `replay-rechazado.json`, `refresh-sin-relectura.json`, `workers-before.json`, `workers-after.json`, `tests-final.txt`, `typecheck-final.txt`. Los outputs no se agregan a Git. Los scripts y contratos reproducibles están en `scripts/pilots/cloudflare-catalog/` y `ACTUALIZACION_CATALOGO_PILOTO.md`.
