# D02 — Conciliación de la RAM entre productor y catálogo público

13/10/2026. Dueño: coordinador Codex. Una unidad local sobre `1cf52b3`, en la copia autorizada `comparador-confianza`, rama `codex/ram-kit-integration-20261012`. Archivos asignados: `scripts/reconcile-offer-evidence.mjs`, su test y esta carpeta. No cambia lectores, precios, asociaciones, MPN, selección editorial, ventanas o infraestructura. La reparación del formato de ayer se conserva sin reabrirla.

## Defecto y resultado esperado

Una lectura nueva guardada en Supabase no garantiza que la copia servida por la Mac la contenga. La RAM candidata GoldenTech188718 reproduce esa diferencia en una terna exacta de producto/tienda/URL. El control local debe distinguir ambas observaciones y el cuerpo público, conservar desconocidos y abstenerse de comparar destinos diferentes. No decide elegibilidad ni resuelve el despliegue.

| Fuente | Fecha propia de oferta UTC | Precio ARS | Stock registrado |
| --- | --- | ---: | --- |
| Supabase, leído13:06:58 | 13/10 12:12:37.760 | 1.202.121,97 | in-stock |
| SQLite activa, leída13:24:43 | 11/10 18:49:20.003 | 1.202.122 | unknown |
| API pública, cuerpo guardado13:17:18 | 11/10 18:49:20.003 | 1.202.122 | unknown |

Las tres URLs y el ID coinciden. SQLite/API coinciden en fecha, precio, stock y condición `special`; el productor es148.997.757ms más nuevo (41h23m17,757s). La diferencia monetaria0,03ARS corresponde al redondeo observado; el problema reproducido es fecha/stock. `input-real.json` conserva fechas exactas de extracción; la captura del API es la hora de guardado del cuerpo, nunca una observación nueva del precio. `result-real.json` es una derivación de esos datos reales, separada de las fixtures sintéticas de los tests.

El runtime local señala release `growth-6473a15`. El ciclo natural `tick-f54e2a89-0289-4b21-851b-dccda516b7af`,13:11:57–13:12:22UTC, tiene ACK de promoción de `mac-refresh-1791897129481`. El archivo activo `scripts/ops/mac-catalog-refresh-job.mjs:308` especifica **storeIds:['compragamer']**, con snapshot actual como fuente; no sincroniza este precio GoldenTech desde Supabase. Su hashSHA256 es `eb3187c4ae29c43a3987f600583ae64e145680e5b088ee0d15b5273464a29a96`, igual a la copia de crecimiento. La fecha de renovación del snapshot no renueva las fechas de sus ofertas. Se registra una causa concreta de alcance, sin generalizar que todas las filas de otras tiendas sean incorrectas ni atribuirlo a caché sin evidencia.

El grafo disponible está construido en `b03ab80` y no contiene el lectorMac; se usó sólo como mapa inicial. La inspección se contrastó con la release activa y el recibo. El Worker de catálogo `c8a57b14` y la publicación Mac son el corte autorizado del12/10; la versión remota de Cloudflare no se volvió a comprobar hoy.

## Fuente exacta y límite editorial

La tienda,13:10:58UTC, muestra el mismo título de kit32GBDDR5-6000CL30, negroRGB,2×16GB, **$1.202.121,97 transferencia/efectivo**, disponible24–48h. Un pago con tarjeta:$1.346.376,61; no mezclar condiciones. HTML y JSON-LD dan sólo SKU de tienda **EL_CORM5VR2X1660**; no MPN/EAN. La única imagen1500px es ilustrativa y no deja leer una etiqueta de fabricante. Catálogo `consistent/exact-attributes` no acredita MPN, EXPO, QVL o compatibilidad a6000MHz. Especialista independiente de catálogo revisó el HTML offline y confirmó la ausencia; no inventó código de Corsair.

La consulta limitada por `PVV532G600C36K` encontró tres filas existentes: la Patriot seleccionada conserva la ofertaCG17061 del10/10; otra fila tiene títuloDDR5-7000Xtreme5 con el mismo campoSKU y URLs de variantes distintas. Ese SKU copiado no permite recuperar una alternativa por sí solo. No se corrigieron categorías/MPN/asociaciones ni se consideró agotado el Patriot por su antigüedad.

**Recomendación:** conservar la selección publicada mientras se verifica el kit exacto. Antes de adoptar Corsair, obtener MPN/EAN de la unidad, perfil XMP/EXPO y altura; luego contrastar compatibilidad y siete ofertas elegibles simultáneas con techo editorial3,3M. No sumar un subtotal histórico al precio nuevo de esta RAM.

Borrador concreto para Jonathan, **sin envío**: «Para la publicación188718, SKUEL_CORM5VR2X1660, necesito el número de parte Corsair y EAN del kit que entregan, foto legible de su etiqueta/caja y confirmación del perfil XMP/EXPO y altura. Confirmar también disponibilidad24–48h y el precio por transferencia de la unidad exacta». No se leyó una conversación privada ni se contactó al comercio.

## Cierre, pruebas y reversión

Reproducir sin red, entorno o credenciales:

```sh
node --test scripts/reconcile-offer-evidence.test.mjs
node scripts/reconcile-offer-evidence.mjs --input docs/direccion/unidades/2026-10-13-ram-evidence/input-real.json
```

Resultado focal inicial:18/18 pruebas; replay real `producer-newer-than-public`, cuatro coincidenciasSQLite/API. Guardas: terna exacta, fechas equivalentes, ausencia, captura frente a observación, corte3h, fecha futura/inválida, precio no numérico y condición de pago distinta. La CLI sólo lee el archivo explícito≤64KiB y escribe stdout. No modifica SQLite/Supabase o la aplicación, no dispara refresh y no admite identidades. No hubo cambio de APIs Next; no se repiten build, suites amplias o matrizUI de la unidad de ayer.

Criterio de cierre **de esta investigación/control local**: entrada real trazable, igualdad del destino, desfase reproducible, fuente activa corroborada, pruebas y revisión independiente. Cierre público pendiente: una observación nueva llega a copia/API/UI con su fecha/condición/stock/identidad originales después de una publicación autorizada y ciclo natural. QA de aplicación en Chrome sigue bloqueada por el cliente; HTTP y este script no sustituyen recorrido interactivo ni PC completa. La tienda sí se observó en una pestaña propia1920×1017; no se pulsó carrito, refresh, afiliados o envío.

Reversión: retirar únicamente estos dos scripts y esta carpeta o revertir el commit propio. No revertir `1cf52b3`, snapshots activos, código de crecimiento o cambios de la principal. Ninguna operación productiva forma parte de esta unidad.

**Siguiente unidad propuesta:** conciliar la fuenteMac de crecimiento con la copia autorizada y preparar en local una admisión acotada de observaciones existentes de las ofertas conocidas necesarias, con validación de terna/variante, precio/stock/condición/fecha propios, rechazo de observaciones más antiguas y promoción con ACK/reversión. No aumentar concurrencia/cadencia/cola, no portar automáticamente otra rama ni decidir arquitectura nueva. Es una preparación futura; no se ejecuta ni se publica por este recibo.

Fuentes crudas y capturas: `docs/reports/crecimiento-2026-09-12/cortes/2026-10-13/` en la copia principal: `db-2.json`, `mac-known-rows.json`, `mac-receipt-0.json`, `ram-api.json`, `ram-exact-store.body`, `ram-tienda-visible.jpg`, `ram-source-image.webp`, `patriot-exact-sku.json`. SHA256 del HTML GoldenTech:`b490ad4ccfd265dce2291683b7bf4dd4edc4f0a4f8e7015bf58af8aacec3affe`. G02 y G07 siguen abiertos; una unidad D02, no una cuarta entrega.
