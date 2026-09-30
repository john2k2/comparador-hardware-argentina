# Correcciones de búsqueda, clasificación y guías — 30/09/2026

La búsqueda y la clasificación están corregidas en producción. Se conservaron los IDs, las ofertas y el historial de precios.

## Guías publicadas

Por indicación de Jonathan, las guías editoriales conservan su selección y admiten **hasta un 10% sobre el presupuesto de referencia** entre revisiones semanales o a pedido: $1M → $1.100.000, $2M → $2.200.000 y $3M → $3.300.000. Un peso sobre esos límites deja de cumplir el margen; las pruebas cubren las tres fronteras. El armador personalizado conserva el máximo exacto elegido.

La página explica la referencia, el límite con margen y la revisión semanal. Se ajustaron las descripciones, metodología y títulos para no prometer un máximo estricto que contradiga el margen. No se cambió la selección de piezas de la guía de un millón: el contraste en CompraGamer dio **$1.005.191**, un **0,52%** sobre la referencia, con siete publicaciones disponibles.

El seguimiento existente `seguimiento-comparador-hardware` revisará las guías **los lunes, o a pedido**, sin repetir una revisión de la misma semana ni alertar por oscilaciones dentro del margen. Se eliminaron las tres instrucciones de lectura diaria de guías; los demás controles diarios mantienen su alcance. La observación automática de ofertas conserva identidad, stock y frescura de tres horas: actualizar una oferta no equivale a renovar la selección editorial.

## Búsqueda

- La RPC prepara texto, palabras y chip de la consulta una sola vez. Usa el nombre normalizado persistido y una señal de formato portátil calculada al guardar las ofertas; conserva los filtros de variante, tiendas, precio, agrupación y paginación.
- La consulta amplia `ryzen` sin categoría todavía alcanzó el timeout público de tres segundos después de la primera optimización. Se agregó un margen **acotado a ocho segundos solamente para `search_catalog_page`**, siguiendo la configuración por función de [Supabase](https://supabase.com/docs/guides/database/postgres/timeouts#function-level). El rol `anon` conserva su límite de tres segundos para las demás consultas. No se agregaron reintentos ni scraping público.
- Tres comprobaciones REST anónimas posteriores devolvieron **200**, con 3.160 resultados: relevancia en 1.606 ms, precio ascendente/página 2 en 674 ms y otra consulta por relevancia en 2.210 ms. Son mediciones puntuales, no una garantía de latencia futura.
- Se cambió la versión de la clave de caché de búsqueda para no reutilizar resultados anteriores a la corrección.

## Clasificación

- La función principal de la pieza tiene prioridad sobre las menciones de compatibilidad. Un cooler compatible con Ryzen sigue siendo refrigeración; un gabinete Ryzen Edition sigue siendo gabinete y una motherboard compatible con Ryzen sigue siendo motherboard.
- Se corrigieron **609 fichas de refrigeración** y **1.741 fichas adicionales** con un tipo principal inequívoco: **2.350 en total**. Las combinaciones/PCs y los procesadores vendidos con cooler incluido conservan sus reglas.
- La admisión SQL también excluye accesorios guardados por error como CPU/GPU/RAM. Las pruebas incluyen CPU con Wraith, RAM compatible con Ryzen y productos de la marca Cooler Master.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Unitarios | 987 aprobados; 2 pruebas externas opcionales omitidas |
| Navegación local | 121/121 aprobados; sin omisiones ni fallos intermitentes |
| Base local PostgreSQL UTF8 | Paridad del matcher, clasificación, paginación y persistencia atómica aprobadas |
| Dos escritores concurrentes | Aprobado; precio, resumen e historial coherentes |
| API y páginas públicas | 39/39 aprobados |
| Navegación pública escritorio/móvil | 8/8 aprobados; incluye igualdad de IDs entre tarjetas y API |
| Lint, tipos, Next/OpenNext | Aprobados |

La primera comprobación de igualdad de IDs usó por error enlaces dentro de `article`; el enlace envuelve la tarjeta. Se corrigió el selector y se repitió la suite completa. El resultado fallido se conserva en la evidencia.

## Evidencia y reversión

La evidencia está en `testsprite_tests/full-validation/2026-09-30/` (ignorado por Git), con prefijos `fixes-*` y archivos `*-fixes-verified.*`. Los respaldos `fixes-db-before.json` y `fixes-primary-category-before.json` conservan las definiciones anteriores y las categorías originales.

Las cuatro migraciones tienen la misma versión local y remota. Para revertir la unidad de búsqueda se puede reponer la definición anterior de la RPC y el Worker anterior, conservando las categorías reparadas y la columna auxiliar sin borrar ofertas o historial. Una reversión de categorías requiere revisar los respaldos frente a los cambios posteriores; no restaurarlos indiscriminadamente.

La versión de Worker verificada es `e34b950a-a85b-4bbe-b6b7-96d58e8318a4`; la anterior al trabajo era `9a32730c-014a-4f92-878f-070c2fb5a76a`.
