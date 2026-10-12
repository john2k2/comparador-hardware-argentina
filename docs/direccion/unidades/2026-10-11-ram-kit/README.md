# D02 — Formato del kit de RAM, 11/10/2026

Una unidad local: impedir que diferencias de espacios descarten un kit correcto o permitan evadir su composición. Dueño: coordinador de este seguimiento; autor y revisor independientes de catálogo, GPT-6.1 Sol/high. Estado: **parche preparado y revisado, sin integración ni publicación**. D02/G02 siguen abiertos.

## Fuente y copia

Fuente de los consumidores: `f811114556557fb801aff554f1fc180e09e324ab`, main remoto leído el 11/10. Blobs contrastados directamente con GitHub: prefiltro `bdb1285f0eecfa02aa5986b33b03faa4880e4e14`; resolver `a4c9bd0f291b410f30baa114d6a64c73e0564477`.

La copia autorizada es `/Users/johnortiz/.codex/worktrees/comparador-confianza/comparador-hardware-argentina`, rama `codex/capacidad-costo-cero`, HEAD previo `3e2d82e6a2b12f9c2f32d38858b992af03cd0ae8`. Estaba limpia y sin escritor ajeno observado. Ese HEAD carece del prefiltro actual y de guardas posteriores: aplicar allí el cambio habría importado infraestructura fuera de la unidad. Se preservó su código y se preparó la corrección sobre una fixture de la fuente publicada en `tmp/ram-kit-f811`. Este documento y el parche son artefactos locales; no son una integración del runtime.

## Defecto y resultado esperado

`buildGuideNameFilters` y `productMatchesGuideSpec` trataban `2x16GB` y `2 x 16GB` de forma distinta. Una especificación espaciada también podía omitir el requisito del kit. El cotejo del título con la URL rechazaba el slug equivalente `2-x-16gb`. La publicación real de Golden Tech 188718 utiliza esa escritura; su registro aporta una reproducción acotada, sin aprobar un reemplazo editorial.

El helper puro reconoce la misma cantidad y capacidad por módulo con espacios equivalentes. Los consumidores mantienen DDR, frecuencia, CL, modelo, color, RGB, formato, precio, stock, identidad y frescura. La guarda final utiliza `buildIdentityEvidence`, con el pathname decodificado, y rechaza composiciones contradictorias tanto en URL como en títulos de origen. No cambia el validador central de identidad.

La revisión independiente detectó primero dependencia del orden entre `2x16GB` y `4x8GB`, y después separadores codificados `%2D` y `%09` que eludían la guarda inicial. Ambas correcciones y un URI inválido `%ZZ` quedaron incluidos en los negativos. Una URL corta con ID que ya admitía ausencia de kit conserva ese contrato.

## Pruebas y cierre de preparación

Matriz final idéntica: fuente intacta **17 fallos / 18 aprobadas**; candidata **35/35 aprobadas**. Matrices intermedias conservadas en la fixture: antes de la guarda de ambigüedad, 5 fallos / 30 aprobadas; antes de decodificar URI, 3 fallos / 32 aprobadas. Revisor independiente: 35/35, sin hallazgos materiales abiertos. ESLint de los cuatro archivos con `--no-ignore`: exit 0. `git apply --check` y aplicación real sobre otra baseline: exit 0, cuatro archivos idénticos a la candidata.

SHA256 del [parche](ram-kit.patch): `cb5a76b273890216b8abf53a4ae3aa83d62ecba64d439b72c47e5705fe2bca0a`. [Manifiesto](EVIDENCIA.json), [log final](after.log), [revisión independiente](REVISION.md) y [aplicación real](APLICACION.json). Las configuraciones copiadas documentan la fixture original; no convierten este directorio en una aplicación compilable.

Reproducción en la copia autorizada, sin llamadas a comercios:

```sh
npx vitest run --config tmp/ram-kit-f811/vitest.before.config.mts
npx vitest run --config tmp/ram-kit-f811/vitest.config.mts
python3 docs/direccion/unidades/2026-10-11-ram-kit/comprobar-aplicacion.py
```

El primer comando debe fallar 17 casos; el segundo aprobar 35. El tercero aplica el parche a una copia temporal fuera del repositorio y comprueba los cuatro hashes: evita que un `git apply` ejecutado dentro de una subcarpeta omita todos los archivos. La fixture original debe conservarse para esta reproducción. Se mantuvieron sus dependencias; no se midieron CPU, latencia ni ahorro y no se ejecutaron PostgreSQL, una suite amplia o un build completo de `f811114`. Esas validaciones corresponden a la integración concreta. No hay cambios de APIs de Next en esta unidad.

Criterio de cierre de esta preparación: evidencia antes/después sobre los mismos consumidores y universo, guardas preservadas, aplicación exacta e independiente revisada. Cumplido. Criterio de cierre del defecto público: integrar sobre una base vigente y autorizada, realizar las comprobaciones proporcionales y comprobar el runtime después de una publicación expresamente autorizada. Pendiente.

Reversión: antes de integrar, retirar este parche no altera la aplicación. Tras una integración, revertir únicamente estos cuatro archivos/cambios en su commit propio. No revertir migraciones ni otras reparaciones publicadas.

## Oferta y decisión editorial pendiente

La candidata `goldentechstore-api-188718` es Corsair Vengeance UDIMM 32GB DDR5-6000 CL30, 1,40 V, kit 2×16GB negro RGB. SKU **de tienda** `EL_CORM5VR2X1660`; MPN del fabricante desconocido. Registro, API pública, ficha pública y publicación exacta de Golden Tech coincidieron el 11/10: **ARS 1.202.121,97**, condición `special`, stock `in-stock`, observación propia `2026-10-11T13:15:50.661Z`; tienda: efectivo/transferencia y disponible en 24–48 h. No acredita retiro inmediato, compra, perfil EXPO, QVL ni estabilidad a 6000.

Propuesta concreta: mantener Patriot `PVV532G600C36K` hasta comprobar el MPN de esta candidata y sus condiciones, y presentar el cambio editorial completo de nombre, CL/RGB, referencia por ID, fuentes y advertencias. No adoptar el SKU interno como MPN. El Corsair negro sin RGB del corte anterior tenía otro SKU y su observación estaba vencida: no es esta variante. WizTech tenía una oferta reciente en revisión y otra aprobación vieja; no mezclar ambas para habilitarla.

La [especificación MSI](https://www.msi.com/Motherboard/B650M-GAMING-WIFI/Specification) confirma dos ranuras DDR5 y 6000 como OC; [AMD Ryzen 5 7600](https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html) especifica UDIMM DDR5-5200 con dos módulos. Son fuentes de plataforma leídas el 11/10; no certifican este kit. La QVL/BIOS y el MPN exacto siguen pendientes.

La guía pública mostraba **5/7**, subtotal **ARS 1.630.573**: CPU y RAM pendientes. La CPU CG14309 conservaba precio 362500 y observación 10:12:40.958 UTC, ya fuera de tres horas; no se reabre su reparación ni se cambia su fecha. Sumar sólo la RAM candidata al subtotal daría seis piezas y **ARS 2.832.694,97**, una proyección incompleta que no es un total de compra ni acredita 7/7. No se cambió la selección, el presupuesto ni la fecha editorial.

Siguiente acción: conciliar este parche con la base vigente sin portar cambios ajenos; después completar la evidencia del MPN y una propuesta editorial con siete ofertas elegibles en el mismo corte. Ninguna publicación, refresh o cambio de modelo queda autorizado por esta preparación.
