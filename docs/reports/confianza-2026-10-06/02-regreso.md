# Unidad 2: conservar publicación y selección al regresar

Una ficha abierta desde el comparador conserva el ID seleccionado, usando el lector canónico vigente. Las redirecciones de búsqueda conservan filtros y página en un origen interno validado. Se mantiene el prefijo de caché v5.

La selección del comparador persiste sólo categoría, uso e IDs A/B, con versión y fecha de selección; caduca en dos horas. Al regresar relee los productos, conserva las fechas reales y cancela la recuperación si el usuario interactúa. Un error parcial conserva el producto disponible y explica cuál falta.

Verificación focalizada: `npx vitest run src/lib/product/product-cache-utils.test.ts src/lib/comparison/selection-recovery.test.ts 'src/app/product/[id]/page.test.ts' --reporter=dot`: 39 pruebas aprobadas en tres suites.

Runtime: la batería integrada de 24 recorridos y la repetición focalizada de seis aprobaron `comparison-return.spec.ts`: ida/vuelta, error parcial y respuesta tardía después de cambiar categoría. En Wrangler local, el harness de catálogo real conservó los dos IDs al visitar la ficha y regresar; no almacenó precios ni stock en el snapshot de selección.

Rollback: retirar selection-recovery y su integración en el comparador; revertir únicamente los cambios de origen/redirección en page y product-cache-utils y sus tests. El reloj de precios y los lectores de main son unidades distintas.

Límite: recuperación por pestaña/sesión; no sincroniza selecciones entre dispositivos ni preserva consultas abiertas.
