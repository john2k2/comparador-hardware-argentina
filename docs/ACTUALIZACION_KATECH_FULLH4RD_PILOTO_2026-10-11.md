# Actualización desde la Mac: Katech verificada, FullH4rd bloqueada

El 11/10/2026 se verificó una actualización real de Katech desde la Mac hasta SQLite, el delta del piloto D1, su búsqueda y el navegador. El Ryzen 7 8700G pasó de $381.900 a **$428.250**, con stock informado y precio especial para efectivo/transferencia. FullH4rd devolvió **HTTP 403 desde la Mac**: no se obtuvo una observación nueva. El piloto quedó pausado, sin contratar servicios ni cambiar la versión publicada.

## Resultado y límites

| Destino conocido | Fuente leída desde la Mac | Persistencia y elegibilidad |
|---|---|---|
| Katech Ryzen 7 8700G AM5 | $428.250, `in-stock`, SKU CPU276, etiqueta explícita de efectivo/transferencia | Una observación admitida y enviada a D1; visible en búsqueda actual |
| Katech Ryzen 5 3400G AM4 | $211.710; disponible bajo pedido, convertido a `unknown` | Consumidor rechaza identidad: no acredita la presentación tray/sin cooler guardada. Conserva precio y fecha anteriores; no aparece como oferta actual |
| Katech Ryzen 5 7600 AM5 | $402.280, `in-stock`, SKU CPU241 | Está asociado a un producto cuyo nombre es Ryzen 7 7700. Rechazo por modelo incorrecto; sin renovar precio ni fecha |
| Katech RX 9070 Gigabyte Gaming | $1.500.570; disponible bajo pedido, convertido a `unknown` | Sólo sondeo de fuente; no se ejecutó persistencia y no se acredita compra inmediata |
| FullH4rd ficha `/prod/30054/…5070-ti…shadow…` | 403 el 11/10 a las 14:19:17.857 UTC | Sin precio nuevo, sin reintentos ni evasión del bloqueo. Las 119 ofertas de FullH4rd en la muestra local quedaron idénticas |

Son cinco destinos investigados, no un barrido completo de ambas tiendas. Se hicieron **ocho solicitudes públicas**: cinco sondeos y tres lecturas del consumidor Katech. El rechazo de 3400G en el consumidor fue por falta de prueba de presentación; su condición bajo pedido se comprobó separadamente en el sondeo. No se guardó ese sondeo como una actualización nueva.

La oferta aceptada conserva la URL `https://katech.com.ar/producto/procesador-amd-ryzen-7-8700g-am5/`, ID `ffd290d8-4b9b-42ad-aaab-13e2ef0c4d60`, SKU CPU276 y título de fuente. Su fecha exacta de observación es **2026-10-11T14:24:21.719Z**, 11:24:21 en la Mac. No se confundió la fecha del producto o la búsqueda con la de la oferta. El registro anterior estaba observado el 01/10 a las 23:53:42.005 UTC.

La categoría actual del 8700G es `procesadores`, aunque sus claves canónica y de variante heredadas todavía empiezan por `almacenamiento`. Ese pendiente de normalización no se corrigió ni prueba por sí solo una comparación incorrecta: la oferta admitida pasó el contrato de CPU. La asociación 7600/7700 sí es un conflicto concreto de modelo; debe corregirse antes de aceptar sus precios.

## Recorrido comprobado

1. Se clonó la muestra privada anterior, preservando el archivo original: 1.012 productos, 1.366 ofertas y 34 tiendas. No se descubrieron ni agregaron productos.
2. El consumidor manual reservó tres ofertas de Katech. Aceptó una y rechazó dos, con historial privado, actualización de base comparable y ACK en una transacción SQLite.
3. `remote-delta.mjs` envió únicamente datos públicos del producto afectado: una oferta, un resumen, siete filas de proyección y ocho de base de precios. Diez statements se confirmaron de forma atómica. La cola e historia privada permanecen en la Mac.
4. La lectura directa de D1 confirmó el precio, stock, condición y fecha exactos. Las dos ofertas Katech rechazadas y la referencia FullH4rd inspeccionada conservaron su JSON anterior. El marcador remoto coincide con la generación local enviada.
5. Doce consultas compararon el motor local original, su proyección y la respuesta remota: precio exacto, rango que excluye la oferta, página siguiente, filtro de tienda y exclusión de referencias no recientes. **12/12 coinciden**. El navegador mostró la oferta aceptada con importe, condición de pago, stock y fecha.
6. Una repetición posterior, seleccionando sólo el 8700G fresco, hizo cero HTTP y conservó todo el catálogo, generación y cola ajena. `fetch` estaba sustituido para impedir red incluso ante una regresión. Puede actualizar la programación local de ese producto; no implica cero escrituras de cola.

La selección explícita de productos se corrigió hasta el SQL de reserva: una pendiente ajena de la misma tienda ya no puede ocupar el lote ni disparar HTTP. Los límites de tres ofertas, dominio, identidad, precio positivo, stock, fechas, presupuesto local, lease y rollback siguen activos.

## Consumo observado

| Operación | Lecturas de filas D1 | Escrituras de filas D1 | Tiempo desde la Mac |
|---|---:|---:|---:|
| Delta real de una observación | 57 | 63 | Recibo atómico confirmado |
| Primera búsqueda del 8700G actualizado, con evidencia | 702 | 0 | 1.246 ms, `MISS` |
| Repetición inmediata de esa búsqueda | 1 | 0 | 167 ms, `HIT` |
| Doce comprobaciones de paridad posteriores | 5.924 en total | 0 | Aproximadamente 1–1,53 s por consulta, `BYPASS` |
| Lectura directa de cuatro ofertas | 12 | 0 | Lectura de control |
| Lectura directa del marcador | 1 | 0 | Lectura de control |

Los tiempos incluyen red desde esta Mac; no son CPU del Worker ni una garantía global. Las doce consultas posteriores quedaron fuera del intervalo certificado de proyección/caché y usaron el fallback correcto. No se amplió la vigencia ni se renovaron fechas para mantener un HIT. El resultado demuestra una actualización pequeña y un HIT real, no que toda consulta vaya a leer una fila.

El panel de Workers mostró **Gratuito, plan actual, 0 USD**. El primer corte posterior a las 14:33 UTC todavía no reflejaba las doce consultas finales: las estadísticas agregadas tienen demora. Un último corte a las **14:37:26 UTC** registró para este D1 **253.783 lecturas y 23.339 escrituras** acumuladas del día; incluye las pruebas anteriores. Antes de esta sesión eran 244.743 y 23.276: la diferencia de esta prueba es **9.040 lecturas y 63 escrituras**. El incremento de escrituras coincide con el delta. El Worker pasó de 144 a 168 solicitudes diarias y conservó cero errores de ejecución en el corte; esto no convierte las respuestas de control 503 en éxitos de búsqueda. Los percentiles diarios de CPU incluyen ejecuciones anteriores y no aíslan este delta.

**No se acredita capacidad gratuita para el catálogo completo.** Faltan un presupuesto diario con todo el tráfico/actualización, medición de CPU de las consultas frías, cobertura, acceso a FullH4rd y operación continua de la Mac. El ledger local estima mantenimiento; no sustituye la cuota compartida de la cuenta.

## Cierre y evidencia

El piloto `catalog-search-free-pilot-20261011` se deshabilitó después de la prueba. Salud y búsqueda autenticadas devolvieron `503 PILOT_STOPPED` antes de leer D1. Se detuvo el puente privado `127.0.0.1:8798`, se retiró el archivo temporal de acceso y se cerró la pestaña de prueba. La D1 de prueba conserva el delta para una próxima revisión autorizada; no tiene scheduler nuevo.

La API de Cloudflare confirmó que producción conserva el mismo deployment `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100 %, hash y fecha de modificación. No hubo push, despliegue público, migración ni escrituras Supabase.

Evidencia local bajo `outputs/katech-fullh4rd-mac-2026-10-11/`, fuera del commit:

- `source-probes/summary.json` y `receipt.json`: cinco lecturas reales y resultados del parser.
- `refresh-real.json`, `local-readback.json`, `fresh-repeat.json`: consumidor, comparación antes/después y repetición sin HTTP.
- `delta-remote.json`, `remote-readback.json`, `targeted-parity.json`: recibos remotos y paridad.
- `search-before.json`, `search-after.json`, `busqueda-katech-actualizada.png`: precio anterior, respuesta nueva, MISS/HIT y pantalla.
- `quota-before.json`, `quota-after.json`, `quota-final.json`: cortes agregados del proveedor, incluida su demora.
- `production-before.json`, `production-after.json`, `paused-controls.json`, `cleanup.json`: límites de publicación y cierre verificados.

Verificación final de código: **83 pruebas aprobadas**: 42 del parser Woo, 17 del consumidor y 24 de contratos (16 de cola y ocho de sincronización/Worker). Cubren pago explícito, backorder, identidad, 403, alcance del lote y CLI fresca. Typecheck completo aprobado; lint sin errores y con un warning previo del incremento condicional de contador de cola. Hubo revisión independiente sin hallazgos materiales nuevos. Los recibos están en `final-woo-tests.txt`, `final-consumer-tests.txt`, `final-contract-tests.txt`, `final-typecheck.txt` y `final-lint.txt`.

Para repetir sin red los contratos: `vitest run src/lib/scrapers/woocommerce-shared.test.ts`; `node --test scripts/pilots/cloudflare-catalog/{refresh-demand,remote-sync,remote-worker}.test.mjs`; compilar `refresh-local.test.ts` como se indica en [actualización del piloto](ACTUALIZACION_CATALOGO_PILOTO.md) y ejecutar su bundle con `node --test`. Runtime real: fuente Katech → consumidor manual → delta D1 → búsqueda → navegador, una oferta admitida y doce consultas de paridad; la repetición fresca posterior bloqueó red por diseño.

Límite de reversión local: el comportamiento de pago explícito se revierte con `woocommerce-shared.ts` y su test; el alcance y soporte del consumidor con `refresh-demand.mjs`, su declaración/test y `refresh-local.ts`/test; el puente y presentación con `remote-mac-server.mjs` y `pilot-ui.mjs`. No se revierte otro código del sitio para retirar estas unidades. El piloto remoto ya está deshabilitado; borrar/restaurar datos remotos sería otra operación, no parte de este cierre.

La siguiente prioridad es corregir las asociaciones de identidad comprobadas y encontrar una fuente permitida y verificable para FullH4rd. Después se debe medir un ciclo diario de actualización sobre una muestra mayor antes de integrar la búsqueda pública. Esta prueba no autoriza esa integración ni demuestra recuperación de FullH4rd.
