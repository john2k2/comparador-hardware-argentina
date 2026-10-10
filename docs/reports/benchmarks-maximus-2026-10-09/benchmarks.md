# Procedencia de benchmarks — corte local 09/10/2026

Base de aplicación: e52a4df55f959875916a7dd991435c5f0101eac3. Sin publicación ni modificación remota.

## Decisión y fuente numérica

Se conservan las 26 CPUs previamente cubiertas, sustituyendo todos los valores por las filas de modelo exacto presentes en las dos series del [Processor Benchmark Chart de Primate Labs](https://browser.geekbench.com/processor-benchmarks). El chart declara Geekbench 7, agregación de resultados enviados por usuarios y un mínimo de cinco resultados únicos por CPU. La declaración de versión pertenece al chart. Es una referencia de cómputo general; no representa FPS, una aplicación particular ni equipos con la misma RAM, sistema operativo o refrigeración.

Corte leído en navegador real por el coordinador: serie Single-Core a las **2026-10-10T01:19:00.304Z** y Multi-Core a las **2026-10-10T01:19:01.876Z**, 09/10 por la noche en Santiago. `consultedAt` es la consulta, no la fecha de ejecución del benchmark; la fuente no informa aquí las fechas de cada resultado. Evidencia externa local: `work/benchmarks-maximus-2026-10-09/evidence/geekbench-chart-single.json`, `geekbench-chart-multi.json`, sus DOM `.txt` y `geekbench-chart-version.png`. Las dos capturas tienen 748 filas; sólo el subconjunto usado se transcribe abajo. Se emparejó texto exacto de CPU y URL idéntica entre ambas series; no se usaron coincidencias por familia.

La URL numérica de cada registro apunta al chart completo; `sourceModel` conserva el nombre exacto de su fila. `modelSourceUrl` identifica la página enlazada por esa fila y se valida contra el modelo, pero **no se usa para inferir versión o puntajes**. Fuente, versión, fecha y referencia al presente registro quedan en cada entrada. Comparaciones por peso exigen el mismo grupo de medición y versión.

## Subconjunto constatado en ambas series

| Modelo exacto en la fuente | Single-Core | Multi-Core | Página enlazada por la fila |
| --- | ---: | ---: | --- |
| AMD Ryzen 7 9800X3D | 2971 | 18751 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-9800x3d) |
| AMD Ryzen 9 9950X | 3061 | 26053 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-9-9950x) |
| AMD Ryzen 9 9900X | 3030 | 22410 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-9-9900x) |
| AMD Ryzen 7 9700X | 3010 | 17767 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-9700x) |
| AMD Ryzen 5 9600X | 2912 | 14259 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-5-9600x) |
| AMD Ryzen 7 7800X3D | 2431 | 15574 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-7800x3d) |
| AMD Ryzen 7 7700X | 2454 | 14449 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-7700x) |
| AMD Ryzen 7 7700 | 2495 | 15114 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-7700) |
| AMD Ryzen 5 7600X | 2592 | 13583 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-5-7600x) |
| AMD Ryzen 5 7600 | 2484 | 12979 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-5-7600) |
| AMD Ryzen 9 5950X | 2083 | 15331 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-9-5950x) |
| AMD Ryzen 9 5900X | 2066 | 14009 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-9-5900x) |
| AMD Ryzen 7 5800X3D | 2013 | 11807 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-5800x3d) |
| AMD Ryzen 7 5800X | 2053 | 11239 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-5800x) |
| AMD Ryzen 7 5700X | 2031 | 10800 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-7-5700x) |
| AMD Ryzen 5 5600X | 2003 | 9239 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-5-5600x) |
| AMD Ryzen 5 5600 | 1930 | 9167 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-5-5600) |
| AMD Ryzen 5 5500 | 1752 | 8167 | [Modelo](https://browser.geekbench.com/processors/amd-ryzen-5-5500) |
| Intel Core i9-14900K | 2668 | 22178 | [Modelo](https://browser.geekbench.com/processors/intel-core-i9-14900k) |
| Intel Core i7-14700K | 2565 | 20912 | [Modelo](https://browser.geekbench.com/processors/intel-core-i7-14700k) |
| Intel Core i5-14600K | 2512 | 17154 | [Modelo](https://browser.geekbench.com/processors/intel-core-i5-14600k) |
| Intel Core i5-14400F | 2009 | 10923 | [Modelo](https://browser.geekbench.com/processors/intel-core-i5-14400f) |
| Intel Core i9-13900K | 2619 | 23105 | [Modelo](https://browser.geekbench.com/processors/intel-core-i9-13900k) |
| Intel Core i7-13700K | 2476 | 19155 | [Modelo](https://browser.geekbench.com/processors/intel-core-i7-13700k) |
| Intel Core i5-13600K | 2308 | 15584 | [Modelo](https://browser.geekbench.com/processors/intel-core-i5-13600k) |
| Intel Core i5-13400F | 2014 | 11169 | [Modelo](https://browser.geekbench.com/processors/intel-core-i5-13400f) |

## Contradicción comprobada en páginas individuales

La [página nominal del Ryzen 5 7600](https://browser.geekbench.com/processors/amd-ryzen-5-7600), consultada el mismo día mediante web y navegador real, usa el texto “user-submitted Geekbench 6 results” y “Geekbench 7” en su calibración/encabezado. Se observó el mismo patrón en las páginas exactas de [7600X](https://browser.geekbench.com/processors/amd-ryzen-5-7600x), [5600](https://browser.geekbench.com/processors/amd-ryzen-5-5600), [9800X3D](https://browser.geekbench.com/processors/amd-ryzen-7-9800x3d) y [14900K](https://browser.geekbench.com/processors/intel-core-i9-14900k). La captura real `geekbench-7600-contradiction.png` y su DOM están en el directorio de evidencia externo citado arriba. No se resuelve esa contradicción por intuición: la fuente numérica/versionada elegida es exclusivamente el chart, cuya declaración y dos series fueron capturadas juntas. Los enlaces individuales documentan la identidad nominal de cada fila.

El [anuncio oficial de Geekbench 7 del 23/07/2026](https://www.geekbench.com/blog/2026/07/geekbench-7/) documenta cargas nuevas y rediseño de multinúcleo. Por eso no corresponde conservar números antiguos sin versión y simplemente rotularlos como 7. Los 26 puntajes de cada serie se reemplazaron por los del corte observado; no se restauraron los valores del 22/09 con URLs nuevas. El Ryzen 5 7600 pasa de 2499/13135 sin versión acreditada y enlace 7600X a 2484/12979 del chart declarado Geekbench 7, con enlace nominal 7600. No se infiere que la diferencia temporal sea una mejora o empeoramiento del hardware.

## GPU: abstención hasta tener evidencia

Se retiran las 30 entradas del índice gráfico RTX 4060 = 100. La tabla anterior sólo enlazaba la [raíz de GPU Database de TechPowerUp](https://www.techpowerup.com/gpu-specs/), sin fila, resultados originales, corte, versión, plataforma, resolución o derivación del índice. La consulta pública de esa raíz y las páginas [RTX 4060](https://www.techpowerup.com/gpu-specs/geforce-rtx-4060.c4107) y [RX 7600](https://www.techpowerup.com/gpu-specs/radeon-rx-7600.c4153), el 09/10/2026, quedó restringida en la herramienta web. El acceso a [una URL de review RTX 4060](https://www.techpowerup.com/review/nvidia-geforce-rtx-4060/) tampoco proporcionó contenido. Un bloqueo no demuestra que el índice sea falso: demuestra que esta reparación no puede acreditar su origen. No se importaron bases derivadas ni se inventaron FPS.

El comparador sigue mostrando precios elegibles y especificaciones de GPU, y puede declarar el menor precio dentro de su ventana de tres horas. El bloque de rendimiento indica falta de benchmark verificable; no muestra puntaje, fuente de rendimiento ni rendimiento por peso. La abstención se aplica también a una CPU no cubierta o a una identidad contradictoria. Las guardas de stock, precio e identidad de las ofertas conservan su funcionamiento.

## Métricas y guardas

Los registros requieren versión, modelo exacto en la fuente, enlace nominal, fecha UTC de consulta, referencia de evidencia y grupo común de comparación. La guarda comprueba esos campos, puntajes positivos y finitos y coherencia de modelo/página Geekbench; **no puede verificar por sí sola la verdad de una página o de una declaración editorial**. La constatación independiente queda en las capturas y en el subconjunto de esta nota.

Para producción/uso diario se expone puntaje Geekbench 7 multinúcleo/un núcleo, respectivamente. Para uso mixto se conserva el índice editorial existente y ahora se aclara su fórmula: `50 × (single / 2500 + multi / 15000)`. Es una ponderación editorial de referencia, no una medición adicional ni un índice oficial de Primate Labs. No se convierte Geekbench en FPS de gaming. Comparar valor por peso y declarar un ganador exige dos precios elegibles y dos benchmarks con la misma versión y grupo. Un ratio individual puede mostrarse con su propio precio fresco aunque el otro no lo tenga. Si falta evidencia de rendimiento o las versiones/grupos difieren, no hay ganador de rendimiento ni ratios parciales.

## Verificación local

Antes de la corrección se añadieron seis casos de abstención/procedencia y fallaron los seis, devolviendo datos sin evidencia versionada, incluido 7600 con URL7600X. Tras constatar el chart global, las regresiones CPU se concretaron en los valores/versiones/fuentes exactos de ese corte; la abstención continúa para GPU. Los tests ya existentes que sólo afirmaban números antiguos se actualizaron para comprobar el contrato de fuente y comportamiento.

- Vitest focal de `performance-benchmarks.test.ts` y `dynamic-comparison.test.ts`: 94/94 aprobadas inicialmente y tras el ajuste de dependencias; última ejecución después de cerrar la guarda de procedencia: 103/103 aprobadas.
- ESLint focal de los cinco archivos fuente/tests modificados: aprobado.
- Nuevos casos de navegador `e2e/comparison-benchmarks.spec.ts`: seis casos aprobados, con modelos7600/7600X y puntajes/links del chart, GPU sin evidencia y CPU no cubierta; 1440px y390px. Además, el coordinador probó el catálogo real en Chrome con Ryzen7600/7600X y RTX4060/RX7600, sin cambiar fechas ni persistir en producción. A390px no hubo desbordamiento de la página ni errores de consola en la muestra.
- `e2e/comparison-freshness.spec.ts` conserva las verificaciones de precio/tiempo/cambio de selección y corrige las expectativas que declaraban valorGPU usando el índice retirado. Se esperan cero ratios en ambas ventanas.

Quedan como límites la variación de agregados con nuevas aportaciones, la fecha desconocida de cada ejecución, los equipos heterogéneos y la falta de baseGPU acreditada. Este corte no prueba el rendimiento en una aplicación específica ni la disponibilidad futura de las ofertas. Candidata local revisada; sin push, despliegue ni escritura remota. El cierre productivo sigue pendiente.

## Corrección de guarda tras revisión independiente

Se reprodujeron cuatro fallas adicionales: `sourceModel` vacío o no parseable y `modelSourceUrl` apuntando al chart o a `/processors/no-real-cpu`. La guarda original filtraba firmas nulas y podía usar el modelo del propio benchmark para compensar la ausencia de identidad de la fuente. Ahora exige que la fuente aporte su propia firma CPU/GPU y que una URL nominal de Geekbench tenga ruta de procesador y firma propia válida y exacta. La guarda equivalente de TechPowerUp exige ruta nominalGPU y chip parseable correcto. También se prueba un modeloCPU de fuente válido pero distinto y cuatro casosGPU equivalentes mediante una fixture explícita, sin incorporar nuevos datos de rendimiento. Último Vitest focal: 103/103; ESLint focal y diffcheck aprobados.
