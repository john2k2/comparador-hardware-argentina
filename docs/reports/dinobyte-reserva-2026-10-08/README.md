# Dinobyte: reserva protegida también en el lector HTML

**Resultado local: el lector HTML conserva stock `unknown` ante reserva de la publicación principal.** Antes convertía en `in-stock` la reserva real de Dinobyte por su botón habilitado y el texto “Disponible para reserva”. La ruta Store API ya conservaba correctamente `unknown`: no se modificó. No hay ofertas nuevas acreditadas ni cambios de datos, asociaciones, MPN, muestra G02, umbral 0,8 o ventanas de tres/24 horas.

La publicación elegida pertenece a almacenamiento, una categoría prioritaria para comparar componentes y armar una PC: [WD Green SN3000 500 GB](https://dinobyte.ar/producto/disco-solido-nvme-western-digital-green-sn3000-500gb/), ID de tienda `3750614`, SKU `DIS731`, producto existente `agrupado-almacenamiento-500gb-digital-disco-green-nvme-sn3000-solido-wes-1g21v68`. Esos identificadores identifican esta publicación; no se adoptan como MPN/GTIN.

La fila guardada tiene ARS 174.900, stock `unknown`, título coincidente, `identity_review: null` y fecha real **08/10/2026 11:20:37.060 UTC**. Está dentro de la ventana del adaptativo `37768442995` (11:12:04–11:29:42 UTC), pero la ventana por sí sola **no atribuye el productor de la fila**. No se extrapola este caso a las 393 observaciones de componentes ni a los contadores de build-support. La muestra puntual contiene doce filas; las asociaciones contradictorias visibles en otras filas no fueron corregidas ni usadas para aceptar este SSD.

El coordinador reunió dos lecturas públicas exactas, conservadas en la copia principal, sin renovación de datos:

| Fuente | Fecha UTC | Evidencia |
| --- | --- | --- |
| HTML, respuesta 200, 291.027 bytes | 13:13:24.496552 | Título, ID de botón y SKU coinciden; stock primario `available-on-backorder`, texto “Disponible para reserva”; JSON-LD `BackOrder`. |
| Store API de detalle, respuesta 200, 12.821 bytes | 13:13:30.451040 | Producto simple, precio ARS 174.900, `is_in_stock: true`, `is_purchasable: true`, **`is_on_backorder: true`**, `stock_availability.class: available-on-backorder`. |

Estas lecturas posteriores confirman reserva en su propio corte. No demuestran cuál era el stock real a las 11:20 ni el contenido de la API original del adaptativo. La hipótesis de que basta `is_in_stock` para recuperar una oferta comprable queda refutada: WooCommerce permite comprar una reserva y expresa ese hecho por separado.

La corrección acotada está en `src/lib/scrapers/woocommerce-shared.ts`: agotamiento explícito conserva su precedencia; después, clase primaria `available-on-backorder`/`on-backorder`, raíz `onbackorder` o texto de stock de reserva/backorder/bajo pedido producen `unknown`. Sólo en ausencia de esas señales se aplican pocas unidades, clase `instock`, botón habilitado o disponibilidad normal. La raíz usa el mismo helper `primary` que stock/precio/SKU, excluyendo `.related`, `.up-sells`, `.upsells`, `.cross-sells`, `.products` y `.w-grid-item`. La reserva presente en un segundo nodo de stock principal también prevalece sobre pocas unidades del primero. No se adoptó JSON-LD o metadata positiva como vía para habilitar stock.

Ruta focal contrastada contra el código de la copia autorizada `ae23d18`, rama `codex/capacidad-costo-cero`:

1. `src/lib/catalog/adaptive-refresh.ts:145` prepara URLs conocidas con `prepareKnownOfferBatch`; no busca equivalencias por similitud.
2. `src/lib/scrapers/woocommerce-known-batch.ts:31` conserva `unknown` cuando hay backorder. La aceptación de `in-stock` requiere señales coherentes y no reserva. El control HTML único del lote, líneas 78–87, no transforma stock desconocido en disponible.
3. `src/lib/catalog/on-demand/worker.ts:117` permite guardar stock desconocido en contexto adaptativo; líneas 127–132 ligan la observación a URL/título/ID/SKU.
4. `src/lib/ai/review-product-offers.ts:80` limita la revisión a CPU/GPU/RAM; esta fila de almacenamiento conserva su review nula. El diagnóstico usa los módulos actuales de identidad y no consulta Jev.
5. `src/lib/catalog/adaptive-refresh.ts:181` persiste la observación; línea 196 cuenta comparabilidad por separado con frescura y `isComparableStoreOffer`.
6. `src/lib/price-utils.ts:49` exige stock `in-stock` o `low-stock`. La fila no tiene conflicto explícito ni revisión pendiente: **stock desconocido es su condición bloqueante**. En el cierre del run, su fecha también satisface ambas ventanas originales.

## Reproducción offline

Desde la copia autorizada, con dependencias locales existentes:

```sh
node scripts/diagnostics/dinobyte-reserva-2026-10-08.mjs \
  /Users/johnortiz/Documents/Proyectos/comparador-hardware-argentina/docs/reports/crecimiento-2026-09-12/cortes/2026-10-08
```

El script lee exclusivamente cuatro archivos con nombres fijos de ese directorio explícito: `dinobyte-adaptive-window.json`, `dinobyte-sn3000-store-api.json`, `dinobyte-sn3000.html` y `dinobyte-source-reads.json`. Valida tamaño, rutas, publicación, recibos e identidad. Transpila dieciséis módulos puros actuales en una VM con dependencias permitidas explícitamente. Extrae mediante AST cuatro funciones de detalle del archivo actual de WooCommerce y las ejecuta con constructor/sanitización/helpers reales; omite los imports de red y otros flujos del archivo. No importa clientes de DB, scraper de red, env ni Jev. No ejecuta scraping, comandos externos o escrituras; imprime JSON en stdout con hashes de fuente y módulos.

La salida esperada es `status: same-block-confirmed`, `actualComparable: false`, fecha `2026-10-08T11:20:37.060Z`, bloqueo `stock-unknown` y reserva actual contrastada. Además, `sourceContrast.htmlParserStock: unknown` y `htmlParserComparable: false` confirman la protección sobre el HTML completo. El constructor del parser genera una fecha sintética local; el script la distingue expresamente y no la presenta como observación nueva. El único control contrafactual sustituye stock **en memoria** para aislar la condición: queda bajo `contrafactualOnlyInMemory`, marcado `observedOffer: false`. No se cuenta como éxito de catálogo. Un recibo ausente, variante distinta, señal de reserva ausente o dependencia nueva hace fallar el diagnóstico.

Validación local ejecutada el 08/10:

- **Antes:** reproducción del HTML completo mediante funciones actuales, exit 1 por `in-stock` recibido frente a `unknown` exigido. En Vitest fallaron seis casos de reserva; siete controles focales pasaron y 22 casos quedaron fuera de ese primer filtro.
- **Después del primer patch:** reproducción completa exit 0, misma fecha/fila histórica bloqueada y HTML protegido como `unknown`; 79 pruebas aprobadas entre `woocommerce-shared.test.ts`, `woocommerce-known-batch.test.ts` y `on-demand/worker.test.ts`.
- **Corrección de revisión P2:** la revisión independiente encontró que el selector de raíz excluía menos clases de relacionados que el helper `primary`. Se reprodujeron seis fallos: `main.product.onbackorder` en `.up-sells`/`.upsells`/`.cross-sells` devolvía `unknown` para el principal disponible; `div.product.onbackorder` con ID `product-987` contaminaba los IDs y anulaba el producto. La raíz ahora reutiliza `primary`. Segunda verificación: 85 pruebas focales aprobadas y reproducción completa conserva `unknown` para la reserva principal real.
- Diecinueve casos añadidos: fragmento real mínimo identificado separado de controles sintéticos; reserva con botón/clase positiva, texto español/inglés, raíz en reserva, conflicto con pocas unidades, agotamiento, relacionados y disponibilidad/pocas unidades normales. Los seis controles de revisión usan nodos que sí coinciden con `main.product` o `[id^=product-].product`; verifican stock e ID principal. El HTML completo no se incrustó en tests: se conserva en el corte y se reproduce por script.
- Verificación sintáctica y controles negativos de argumento ausente/ruta relativa/directorio inexistente. Lint focal de los tres archivos JavaScript/TypeScript cambiados aprobado tras renombrar una variable del helper de VM que violaba una regla de Next.

No se acreditó una oferta nueva. La revisión independiente del 08/10 encontró el P2 de alcance primario y lo cerró después de la corrección: 20 controles seleccionados y el diagnóstico del HTML completo aprobaron; sin hallazgos materiales nuevos en ese segundo pase. El coordinador inspeccionó el diff y reprodujo el resultado final. Los avisos de Vite/config y deprecación de `module.register()` fueron ajenos al cambio.

## Cierre, reversión y paso siguiente

El criterio de cierre local se cumplió: el script confirma el mismo bloqueo y la protección HTML con estas cuatro fuentes, conserva la fecha, pasan las 85 pruebas focales/lint y la revisión independiente cerró el P2. No cierra G02/95%, cobertura de Dinobyte, disponibilidad histórica, guía completa ni aceptación editorial. Los cuatro archivos constituyen una unidad para commit local autorizado; publicación e integración externa siguen pendientes de autorización concreta. Este resultado no acredita que producción ya ejecute el cambio.

La reversión consiste exclusivamente en retirar este README y el script diagnóstico, y revertir el hunk de reserva/alcance primario y los diecinueve casos añadidos en `woocommerce-shared.ts`/`.test.ts`, preservando cambios ajenos. No hay estado remoto ni datos que restaurar.

El siguiente paso útil es seleccionar **otra publicación exacta con disponibilidad primaria explícita**, identidad/variante confirmadas y fecha real dentro de tres horas para la pieza requerida. Para una guía, completar siete piezas elegibles y compatibilidad antes de revisar la selección editorial. Repetir refresh de esta reserva para elevar el contador no resuelve falta de stock.

Límite de la corrección: protege las señales explícitas de reserva del stock/raíz principal que observa el parser. No acredita disponibilidad de fuentes sin esas señales, no corrige asociaciones históricas y no ejecuta tráfico o actualizaciones remotas. No se propone fallback HTML para hacer comparable esta reserva.

El grafo histórico `graphify-out/graph.json` de la copia principal sólo orientó el entorno WooCommerce; carece de varios módulos recientes de esta ruta y no se usó para acreditar la causa. Consulta de orientación acotada, salida aproximada de 1.268 tokens; cero reconstrucción o escritura del grafo. No se emplearon hechos de memoria: el registro consultado no devolvió coincidencias pertinentes.
