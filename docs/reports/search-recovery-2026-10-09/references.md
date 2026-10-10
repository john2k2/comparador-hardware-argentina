# Búsqueda de productos sin ofertas recientes

Estado: candidata local, revisada; publicación pendiente. Base publicada contrastada: `f1ce80968c45bf78623ce6efb960152c7c5829ed`.

Una búsqueda de RTX 5090 devolvía cero ofertas actuales aunque existían 66 fichas de referencia. El usuario debía encontrar y activar un checkbox para ver el producto. Ahora, cuando una búsqueda textual queda vacía y no tiene rango de precios, se consulta la primera página de referencias con la misma categoría, tiendas y orden. Se muestran hasta seis fichas separadas y un acceso al listado completo. El encabezado distingue cero ofertas recientes de las fichas encontradas.

La consulta adicional utiliza la clave `includeUnavailable`, separada de las ofertas actuales. No se ejecuta para una búsqueda que ya tiene resultados, ante error primario, sin texto ni con rango explícito. Los errores secundarios se informan y permiten reintentar sin cambiar URL ni filtros. Al cambiar de búsqueda se aborta/desmonta la lectura previa.

No se amplían las ventanas de frescura ni se cambia stock, identidad, precios, RPC o presupuesto. Consultar una referencia no renueva su fecha. El componente no afirma agotamiento ni disponibilidad actual.

## Verificación

- Matriz integrada: 19/19 E2E en Chrome, build de producción con Webpack, un worker. Incluye cinco familias de productos, error 503 seguido de recuperación, rango imposible, categoría y tienda explícitas, cambios rápidos, paginación, historial y móvil.
- Búsqueda: 177/177 pruebas en 23 archivos; lint focal y `git diff --check` aprobados. Build verifica TypeScript.
- Revisión independiente: se encontró y corrigió reintento secundario ineficaz; se añadió selección real de tienda y categoría a la prueba. Segundo pase sin hallazgos materiales.
- Navegador real contra catálogo anónimo, servidor local `127.0.0.1:3119`, sin credenciales de escritura ni scraping: RTX 5090 muestra seis referencias automáticamente. Su ficha abre con precios pendientes y el enlace de retorno conserva consulta y referencias. En móvil no hay desborde horizontal.
- API pública: 14 consultas actuales/referencias para RTX 5090, 5080, 5070, Ryzen 7600, 9800X3D, Kingston NV3 y DDR5; todas respondieron 200. Cada producto devuelto en las primeras páginas actuales pasó `getRecentProductOffers`. No se recorrió todo el catálogo.

Comandos: `npx vitest run src/lib/search src/components/search`; `npx playwright test --config=tmp/playwright-search-recovery.config.ts e2e/search-reference-recovery.spec.ts e2e/search-category-transition.spec.ts e2e/search-filters.spec.ts e2e/search-pagination.spec.ts`. La configuración temporal mantiene las variables aisladas de `playwright.config.ts` y usa `next build --webpack` porque el enlace local de node_modules no funciona con Turbopack; no es un cambio del compilador publicado.

## Límite de la reparación

Los lectores públicos de CompraGamer, Dinobyte y MaxTecno no encontraron una 5090 de escritorio comprable en ese corte: los IDs antiguos de CompraGamer estaban ausentes, las 11 publicaciones de Dinobyte indicaban sin stock y MaxTecno sólo devolvía notebooks. Los controles de otros productos sí se leyeron. Esto no prueba agotamiento global ni una recuperación del catálogo completo.

Reversión: retirar sólo `SearchEmptyState`, su integración en `SearchPageView`, la nueva suite de referencias y este documento. No afecta datos remotos ni otras unidades. Se conservaron los cambios anteriores de medición y mapper CompraGamer fuera de esta unidad.

Evidencia completa: `/Users/johnortiz/.codex/.chatgpt-projects/g-p-6ac68be47f5481918948c30ea16ffd6b/work/rtx5090-fix-2026-10-09/`.

## Integración con la verificación de publicación

La publicación fue autorizada con «si hacelo». La candidata aprobó 41 controles HTTP públicos y el recorrido real de siete consultas, móvil, filtros y ficha/regreso. Después de conciliar la fixture de categoría automática, el segundo Verify aprobó código y SQL aislado, y 75/76 E2E: el caso de catálogo vacío todavía esperaba el encabezado anterior `RESULTADOS: 0 ITEMS`.

Se ajusta esa expectativa al encabezado aprobado `OFERTAS RECIENTES: 0`, conservando la exigencia de cero artículos y la ausencia de error/estado inicial. Las suites nuevas de referencias y transición se incluyen en `test:e2e:critical`, para ejecutarse en Verify junto a las regresiones existentes. No cambia la implementación publicada ni se desactiva una comprobación. La revisión independiente confirmó la expectativa. La matriz crítica completa, incluidas ambas suites nuevas, aprobó 88/88 casos en una exportación aislada de la aplicación publicada antes de publicar el ajuste de tests.
