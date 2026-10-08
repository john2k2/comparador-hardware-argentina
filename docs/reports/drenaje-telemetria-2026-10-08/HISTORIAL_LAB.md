# Laboratorio de historia fría — resultado local del 08/10/2026

**Recomendación: rechazar por ahora la adopción del empaquetado JSONB propuesto como ahorro de capacidad.** Conserva los ocho campos, pero ocupa más que la tabla tipada con PK e índice de oferta y reconstruye todas las filas más lentamente. La ventaja frente a seis índices en la muestra no demuestra que empaquetar sea mejor que conservar filas tipadas y revisar los índices necesarios para cold.

Estado: laboratorio local medido; sin implementación de RPC, migración, retiro de historia, consulta remota ni publicación. Esta evidencia condiciona la propuesta preparatoria de [HISTORIAL_FRIO.md](HISTORIAL_FRIO.md); arquitectura e integración siguen a cargo del coordinador.

## Fuente, aislamiento y recibo

- Programa: `scripts/pilots/history-cold-layout.mjs`, 249 líneas; SHA-256 `9ee8bdafd92cc61533a126044b88aac435a2653b8e9b497a14ac7c0601c04556`.
- Fuente fija: `tmp/restructuracion-2026-10-08/input.json`; captura 08/10 a las **19:40:58.683437 UTC**, fuente `268f9792a76ca047b125f48fa278cd851c6282a5`, PostgreSQL informado 17.6. SHA-256 `bcbcb76f34d0c0619f95dd0f7ff61e7e0ee80c9dd46badc7caf436ec2987f33d`.
- Recibo final: `tmp/drenaje-telemetria-2026-10-08/cold-lab-G3cLjM/receipt.json`, terminado a las **20:52:03.931 UTC**; SHA-256 `c2120f6337edc36252e9cb019ffa738743e49190c3b32bc3587042366bef771a`.
- PostgreSQL propio **17.11 Homebrew**, socket Unix privado corto, `listen_addresses=''`, sin TCP, entorno hijo mínimo sin heredar `PG*` ni configuración/credenciales del proyecto. Clúster detenido y directorio temporal propio retirado; salida nueva `0700`, recibo `0600`.
- Ejecución final: 3.640 ms de reloj para creación, carga, comprobaciones, medición y cierre. Repeticiones anteriores se conservaron como antecedentes; las cifras siguientes corresponden al recibo final y modelo final.

La muestra tiene 5.000 filas de historia y proviene de ventanas por PK, no de CSV independiente ni snapshot transaccional. La serialización JSON recibida sólo contiene fracciones temporales de 0–3 decimales; su precisión productiva no se puede certificar por este round-trip. Se ensayó precisión con una fixture textual independiente de 768 filas.

## Representaciones comparadas

| Variante | Qué incluye |
|---|---|
| Tipada mínima | Ocho columnas originales, UUID PK, dinero `numeric(14,2)`, timestamp `timestamptz`, FK producto/tienda y un índice producto/tienda/URL/fecha. |
| Tipada con seis índices | Misma tabla más cuatro índices; reproduce las claves de los seis índices capturados de historia, sin ejecutar sus definiciones remotas. Es una referencia física, no autoridad para eliminar índices. |
| Paquete PG17 | Identidad producto/tienda/URL/mes UTC/parte fuera del array; `UNIQUE NULLS NOT DISTINCT` separa NULL de vacío y evita almacenar otra copia de URL. Hasta 256 observaciones y 1 MiB de texto JSONB por paquete. |
| Observación JSONB | Array `[UUID, precio-texto, original-texto-o-null, stock, timestamp-UTC-seis-decimales]`; conserva los valores, sin compactación diaria ni agregados por categoría. |
| Registro de IDs | UUID PK → paquete/ordinal; FK al paquete y `UNIQUE(paquete,ordinal)`. Se incluye su tamaño, con dos índices. Sólo garantiza unicidad cold; no implementa unicidad global hot/cold. |

DDL en `scripts/pilots/history-cold-layout.mjs:29`; empaquetado y registro en una transacción `:51`; comparación y guard de colisiones `:61`.

## Espacio físico observado

Todos los valores son bytes de relaciones nuevas locales. Los totales incluyen heap/TOAST/mapas e índices; las tablas auxiliares de productos/tiendas, restore y clúster no se incluyen porque son soporte común del laboratorio.

| Dataset | Filas / paquetes | Tipada mínima | Tipada 6 índices | Paquete | Registro UUID | Paquete + registro |
|---|---:|---:|---:|---:|---:|---:|
| Muestra JSON | 5.000 / 4.805 | 1.933.312 | 3.260.416 | 2.072.576 | 753.664 | **2.826.240** |
| Submuestra >90 d | 3.005 / 2.828 | 1.064.960 | 1.908.736 | 1.138.688 | 491.520 | **1.630.208** |
| Fixture independiente | 768 / 64 | 221.184 | 286.720 | 139.264 | 172.032 | **311.296** |

El corte exclusivo de la submuestra es `2026-10-08T19:46:54.059844Z − 90 días`. Sus 3.005 filas tienen URL NULL: no representa las ofertas vinculadas por URL exacta de la RPC vigente ni acredita que toda historia antigua carezca de URL.

| Muestra de 5.000: desglose | Heap | Tabla con auxiliares/TOAST | Índices | TOAST incluido |
|---|---:|---:|---:|---:|
| Tipada mínima | 811.008 | 843.776 | 1.089.536 | 8.192 |
| Tipada 6 índices | 811.008 | 843.776 | 2.416.640 | 8.192 |
| Paquete | 1.253.376 | 1.286.144 | 786.432 | 8.192 |
| Registro UUID | 303.104 | 327.680 | 425.984 | 0 |

La muestra forma apenas **1,0406 observaciones por paquete**, máximo tres; la submuestra 1,0626, máximo tres. Esa dispersión dificulta amortizar cada paquete. La fixture agrupa doce en promedio, máximo veinte, pero su registro de UUID revierte la ventaja. El tamaño TOAST incluye infraestructura; no mide por sí mismo una tasa de compresión.

Con registro, JSONB añade **892.928 bytes** frente a la tipada mínima en la muestra y **565.248** en la submuestra. Frente a seis índices reduce 434.176 y 278.528 respectivamente, pero la fixture empeora incluso frente a seis índices en 24.576 bytes. No extrapolar esos descuentos a 250.606 filas, ni a `pg_database_size` productivo.

## Consulta, integridad y recuperación

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, tres ejecuciones seriales locales por consulta; rango mínimo–máximo de **Execution Time**, sin red ni serialización del resultado al consumidor:

| Consulta | Tipada | Paquete |
|---|---:|---:|
| Ocho campos, 5.000 filas completas | 0,256–0,275 ms | 3,583–3,817 ms |
| Una oferta de esa muestra | 0,027–0,031 ms | 0,045–0,046 ms |
| Un UUID, ocho campos, misma muestra | 0,020–0,024 ms | 0,031–0,037 ms mediante registro |
| Ocho campos, 3.005 filas antiguas | 0,151–0,168 ms | 2,172–2,352 ms |

No son percentiles ni latencia pública. Planes y buffers se conservan en el recibo. CPU de Node: 84.142 µs user / 132.162 µs system; RSS al terminar 141.656.064 bytes, no máximo. CPU/memoria del servidor PG no se aislaron; no atribuirle esos valores de Node. Empaquetar tomó 60/37/16 ms de reloj cliente para muestra/submuestra/fixture, con lanzamiento de proceso incluido.

Pasaron en los tres datasets: `EXCEPT ALL` de ocho campos en ambos sentidos, conteos iguales, UUID distintos, correspondencia de conteo del registro y restore dos veces sin duplicar. La guard rechaza igual UUID con valores distintos y la transacción revierte la alteración de prueba (`scripts/pilots/history-cold-layout.mjs:127`).

La fixture conserva precio máximo, original negativo/null, microsegundos, empates UUID, stock en sus cuatro estados y URLs NULL/vacía/variantes/texto escapado. Pasaron FK ausente, actualización de padres en cascada, borrado de tienda restringido y borrado de producto en cascada hasta el registro (`scripts/pilots/history-cold-layout.mjs:175`). No infiere disponibilidad.

## Cierre y siguiente acción

Entregados sólo el programa y este reporte. Validación: `node --check scripts/pilots/history-cold-layout.mjs` y ejecución local del mismo archivo; SQL DDL/fixtures/ANALYZE/restore exclusivamente en el clúster propio descartado. No se modificó la aplicación ni se crearon migraciones.

Quedan abiertos: paridad real de `hardware_price_index(7/90/365)`, cohorte dinámica, anclas y días Buenos Aires en consultas, escritores actuales, unicidad hot/cold, RLS efectiva de un diseño productivo, respaldo global, pico de coexistencia/WAL/rollback y recuperación física. Mes UTC aquí sólo particiona: no realiza compactación diaria ni redefine la serie.

El coordinador debe **descartar la adopción de este layout JSONB por ahora** y decidir si asigna una comparación cold tipada con índices mínimos y paridad de la RPC. Cambiar esa recomendación requiere densidad por oferta/mes y medición compatible adicionales; un agregado por macrocategoría no sustituye el contrato. Conservar respaldo exacto y hot actual mientras se decide; no retirar originales a partir de este laboratorio.
