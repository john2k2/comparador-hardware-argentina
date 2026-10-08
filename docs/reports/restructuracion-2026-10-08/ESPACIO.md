# Laboratorio de espacio del catálogo

Ensayo local autorizado sobre candidata `268f979`, rama `codex/capacidad-costo-cero`, con escritura limitada a `scripts/pilots/catalog-restructure-space.mjs`, su test y este documento. Se leyó `AGENTS.md` de esa copia. `docs/direccion/README.md` está ausente allí: se consultó la copia principal, que mantiene capacidad física y coste cero abiertos. El coordinador integra y decide cualquier alternativa o acción remota.

El laboratorio acepta un JSON privado explícito con metadatos reales y filas públicas completas, hasta 5.000 por tabla. Usa PostgreSQL 17.11 Homebrew en un clúster nuevo propio, directorio y socket UNIX privados, sin TCP ni variables del proyecto. Verifica identidad y directorio antes de ejecutar operaciones, detiene sólo ese clúster y elimina sólo sus temporales. Los recibos usan creación exclusiva y permiso 0600 dentro de `tmp/restructuracion-2026-10-08` (0700). No acepta URL de conexión ni archivos fuera de ese directorio.

Reproduce columnas, tipos con precisión y nulabilidad; carga los valores reales de columnas GENERATED como columnas ordinarias. Recrea cada definición de índice exacta, verifica su igualdad contra `pg_get_indexdef` y conserva valores completos. Omite defaults, generación, triggers, FK, políticas, funciones de negocio y configuración de almacenamiento/collation de producción: es una prueba de estructura física y presión de actualizaciones, **no una prueba de API o semántica completa de la reestructuración**. Sólo instala `pg_trgm` y `pgstattuple` en su clúster propio. Metadatos SQL se restringen a tablas, tipos, métodos y funciones permitidos; los datos viajan mediante COPY CSV por stdin y no se imprimen.

## Comparación medida

1. Carga fresca con los mismos índices: `pg_relation_size`, `pg_table_size`, `pg_indexes_size` y `pg_total_relation_size` por tabla. TOAST se registra separado, ya incluido en `tableBytes`.
2. Tres UPDATE de los mismos valores y VACUUM sin truncar: permiten observar MVCC y páginas reutilizables sin cambiar ofertas.
3. Cinco incrementos sintéticos de un segundo en las fechas usadas por índices, exclusivamente locales, luego VACUUM: permiten distinguir coste por renovación de fechas del simple UPDATE.
4. Restauración de esas fechas por resta exacta; hash SHA-256 agregado de filas completas ordenadas igual al original en cada tabla.
5. VACUUM FULL local con los mismos índices; vuelve a verificar hashes y mide bytes compactados. No conserva la simulación como observación real ni convierte su fecha en frescura de una oferta.

`pgstattuple` mide tuplas vivas, muertas y espacio libre del heap local. `pgstatindex` registra páginas y densidad de índices btree locales. Esos resultados **no miden bloat remoto**. Un contador remoto de lecturas sin período/reset tampoco prueba un índice innecesario. La duplicación estructural debe contrastarse con restricciones y contratos de ingeniería antes de proponer su retiro.

El recibo distingue medición física de la muestra y extrapolación lineal al conteo agregado real o estimado. La extrapolación usa `bytes locales / filas locales × población`, muestra cada índice y conserva su tamaño remoto. No asegura que el total reconstruido entre en 450 MB: cardinalidad, distribución, GIN pending pages, overhead de tablas pequeñas y configuración pueden modificar el resultado. El laboratorio no escala repetición sintética de IDs para fingir un catálogo completo.

Tiempos son wall clock con cliente incluido. CPU, memoria máxima, tiempo de red, WAL/pico de disco, locks de producción y consultas del negocio quedan sin medir; no se atribuye una causa de latencia desde este ensayo.

## Resultado con muestra pública real

**Ejecutado el 08/10/2026, 19:45:01–19:45:12 UTC.** Metadatos de 19:40:58 UTC y veinte GET de muestra entre 19:43:05–19:44:10 UTC, preparados por el coordinador. PostgreSQL fuente 17.6; laboratorio 17.11. `localCodeVersion` identifica la candidata local `268f979`, no demuestra la versión de aplicación desplegada. Input privado: `tmp/restructuracion-2026-10-08/input.json`, SHA-256 `bcbcb76f34d0c0619f95dd0f7ff61e7e0ee80c9dd46badc7caf436ec2987f33d`. Recibos agregados privados: `space-result.json` y `space-result-v2.json` en el mismo directorio. La repetición de 19:47:24–19:47:35 UTC registra explícitamente los cuatro hashes por tabla antes/después en `hashCheckpoints`; conserva exactamente los mismos tamaños iniciales, anteriores a FULL y reconstruidos del primer ensayo. Ambos recibos se preservan; ninguno fue sobrescrito.

5.000 filas por tabla, 20.000 completas en total, con **65 columnas y 39 definiciones de índice exactas**. Muestreo sistemático de cinco ventanas de 1.000 filas separadas por posiciones en orden de PK. No es muestra aleatoria garantizada ni snapshot transaccional; el orden textual de productos correlaciona con origen y no certifica cobertura por categoría/tienda. Los conteos de población son estimadores. El muestreo no cierra referencias externas y no sirve como respaldo de migración.

La tabla siguiente contiene **bytes locales medidos de cada muestra de 5.000 filas**, después de la carga fresca:

| Tabla | Heap B | TOAST B (incluido en tabla) | Índices B | Tabla más índices B |
|---|---:|---:|---:|---:|
| catalog_price_summaries | 4.849.664 | 147.456 | 2.064.384 | 7.086.080 |
| price_history | 827.392 | 8.192 | 2.195.456 | 3.055.616 |
| product_prices | 2.523.136 | 8.192 | 2.875.392 | 5.431.296 |
| products | 6.512.640 | 24.576 | 11.116.544 | 17.678.336 |

Las cuatro muestras suman **33.251.328 B** inicialmente. Tras tres actualizaciones de mismos valores, cinco incrementos sintéticos de fecha y su restauración, llegan a **179.142.656 B**. El VACUUM FULL local las deja en **33.259.520 B**: devuelve **145.883.136 B de tablas e índices** en ese experimento inducido, no en producción. El delta de base local es 145.498.112 B; no se confunde con la suma de relaciones. Los hashes SHA-256 completos de las cuatro tablas permanecen iguales después de restaurar fechas y después de FULL. Clúster detenido y temporales eliminados.

En `products`, los índices pasan de 11.116.544 B a 78.995.456 B y vuelven a 11.337.728 B con FULL. La carga reconstruida no tiene exactamente el mismo tamaño que la carga inicial: ordenar/rellenar páginas y reconstruir GIN cambia páginas físicas aun conservando cada valor. El VACUUM normal anterior deja cero tuplas muertas en las cuatro tablas, **sin devolver esos bytes**. En `products` quedan 29.508.480 B libres en el heap local después del segundo VACUUM. Pocas tuplas muertas no prueban pequeña asignación o ausencia de páginas libres/crecimiento de índices.

El escenario renueva todas las filas de la muestra simultáneamente, con autovacuum apagado sólo en el clúster propio para separar fases. Las tres actualizaciones de `price_history` son exclusivamente una prueba sintética de MVCC: no atribuyen ese patrón a la historia real, cuyo contrato es inserción/retención. Este experimento no mide tasas reales ni reproduce carga, concurrencia, mantenimiento automático o escritura del catálogo completo.

La siguiente tabla contiene **asignación remota capturada** y **extrapolaciones lineales**; las dos últimas columnas no son tamaños productivos medidos:

| Tabla | Población estimada | Asignación remota B | Estimación fresh B | Estimación reconstruida B |
|---|---:|---:|---:|---:|
| catalog_price_summaries | 57.426 | 119.382.016 | 81.385.046 | 80.444.178 |
| price_history | 249.691 | 178.339.840 | 152.591.963 | 150.955.588 |
| product_prices | 73.705 | 103.481.344 | 80.062.734 | 78.613.635 |
| products | 59.571 | 238.329.856 | 210.623.231 | 213.258.461 |
| **Suma** | — | **639.533.056** | **524.662.974** | **523.271.862** |

**El mismo esquema no acredita el objetivo de 450 MB.** Su extrapolación reconstruida ya suma 523,27 MB decimales para estas cuatro tablas, antes de caché, otras tablas e infraestructura de la base. La diferencia con la asignación remota no es una medición de bloat ni ahorro recuperable; necesita reconstrucción completa o evidencia más fuerte antes de planificar una operación remota. Un ejemplo de no linealidad: el índice `product_prices_inventory_reference_idx` extrapola 10.264.453 B desde la muestra y ya ocupa 8.134.656 B remotos, de modo que el escalado no subestima siempre.

Los metadatos muestran la equivalencia estructural exacta de `products_updated_at_idx` y `products_updated_at_desc_idx`, ambos `btree(updated_at DESC)`, 1.400.832 B cada uno. No hay contadores/reset de lecturas en esta captura: no se declara ninguno unused. La redundancia por sí sola tampoco resuelve el margen de capacidad. **No se ejecutó alternativa thin ni se retiró un índice.**

Siguiente acción del coordinador: contrastar los 39 índices con restricciones y consultas reales, definir un contrato concreto de alternativa delgada y repetir la misma muestra en laboratorio. Mantener abierta la ruta de reconstrucción sin cambios de API, pero no proponerla como cierre de capacidad a partir de estos números. Las pruebas de API, generación/triggers, identidad, siete ofertas, historia y observación real corresponden a otro frente y a la integración final.

## Verificación del harness

`node --test scripts/pilots/catalog-restructure-space.test.mjs`: siete pruebas aprobadas el 08/10/2026. Incluyen rechazo de secretos/URI de base/datos personales, filas incompletas, límites de muestra, tabla/tipo desconocidos, SQL adicional, funciones arbitrarias e índices no preparados. La integración usa fixture sintética explícita: verifica TOAST físico, tuplas muertas después de UPDATE, bytes de tabla más índices, igualdad tras restauración, cierre/limpieza del clúster y protección contra sobrescritura. Se corrigieron el formato legacy sin validación de tipos y la diferencia entre NULL de array y texto «null», con comparación contra la entrada antes del hash. Esa fixture verifica el mecanismo; sus bytes no representan el catálogo.

Comando para muestra real: `node scripts/pilots/catalog-restructure-space.mjs tmp/restructuracion-2026-10-08/input.json tmp/restructuracion-2026-10-08/space-result.json`.

Cierre permitido: recibo local de la muestra real conciliado, clúster detenido y límites explícitos. Publicación, mantenimiento remoto y capacidad física real permanecen abiertos hasta otra operación concreta y autorizada. El coordinador conserva la custodia del JSON público completo y la elección del siguiente ensayo.
