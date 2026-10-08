# Reestructuración selectiva: primera entrega local

Jonathan autorizó ejecutar la recomendación de probar una reconstrucción selectiva en una copia local. Se trabajó sobre `codex/capacidad-costo-cero`, base `268f979`, en la copia de integración; la copia principal conserva los cambios anteriores y la dirección. Esta entrega no publica el paquete anterior, ejecuta mantenimiento remoto ni autoriza vaciar Supabase.

## Decisión basada en el ensayo

**Rechazar el borrado total como método de optimización. Tampoco aprobar todavía una reconstrucción del mismo esquema como solución de costo cero.** La prueba física mantiene valores e índices, pero su extrapolación ya sitúa las cuatro tablas principales en 523,27 MB, antes de incluir caché y otras estructuras. No certifica el objetivo operativo propuesto de 450 MB ni el límite gratuito de 500 MB. El objetivo de 450 MB es una reserva de trabajo propuesta, no una cuota del proveedor.

El catálogo actual ya reemplaza ofertas por `(product_id, store_id, url)` y evita muchas escrituras iguales. Hay dos contratos de historial: el writer general también registra cambios de cuotas; el adaptativo registra precio/original/stock. Presentar la deduplicación como una función ausente sería un diagnóstico equivocado. Los eventos operativos usan claves temporales distintas; expirar su lectura tampoco retira automáticamente sus filas.

La recomendación siguiente es reducir almacenamiento activo con archivo recuperable y lecturas compatibles, empezando por telemetría vencida. Si luego se archiva historia fría, debe conservarse el contrato histórico antes de retirarla. El índice de hardware admite 7–365 días, une URL exacta, necesita anclas previas y propaga cambios por día Buenos Aires. Cortar a 90 días sin adaptar sus lecturas rompe resultados; no se aprobó ese recorte por el hecho de existir 150.615 filas anteriores a 90 días.

## Medición y límites

Lectura remota exclusivamente de metadatos/agregados y cuatro tablas públicas mediante GET: sin SQL de mutación, subida a Storage, refresh ni lectura de datos personales. La captura valida proyecto y tablas, rechaza redirecciones, limita respuestas y conserva archivos privados con creación exclusiva. Se obtuvieron 5.000 filas completas por tabla, 20.000 en total, desde cinco ventanas distribuidas por clave primaria. Tráfico de cuerpos: 19.680.512 B. Es una muestra con posible sesgo y escrituras concurrentes; no es snapshot transaccional, backup ni conjunto cerrado por FK.

| Corte UTC del 08/10/2026 | Evidencia |
|---|---|
| 19:40:58 | Columnas, tipos, expresiones, índices y asignación de cuatro tablas; PostgreSQL fuente 17.6 |
| Ventanas registradas en la captura | Filas públicas completas; cada respuesta tiene fecha/hash; no se atribuye a un único instante |
| 19:45:12 | Base completa 938.077.331 B; relaciones públicas 923.688.960 B |
| 19:46:54 | Telemetría store/endpoint vencida: 329.096 + 13.897 = 342.993 filas; historial: 38.436 hasta 14 días, 61.555 entre 14–90, 150.615 entre 90–365 |

El laboratorio físico usa PostgreSQL 17.11, socket UNIX privado, sin TCP, con proceso/entorno separados. Carga valores capturados, incluidas columnas derivadas, y reproduce las 39 definiciones de índice. No reproduce las expresiones GENERATED, defaults, FK, RLS, triggers ni RPC en este laboratorio físico; esas diferencias impiden llamarlo restauración funcional completa. Dos ejecuciones reales concordaron en las medidas principales y conservaron hashes locales en cuatro checkpoints. Los clústeres propios se detuvieron y eliminaron.

| Cuatro tablas principales | Bytes | Naturaleza |
|---|---:|---|
| Asignación remota capturada | 639.533.056 | Medida remota de relaciones |
| Muestra nueva con índices | 33.251.328 | Medida local de 20.000 filas |
| Muestra tras presión de UPDATE y restauración | 179.142.656 | Escenario sintético, autovacuum local apagado |
| Muestra tras reconstrucción física | 33.259.520 | Medida local con todos los valores preservados |
| Extrapolación reconstruida al catálogo | 523.271.862 | Estimación lineal; no ahorro ni bloat remoto medidos |

En el ensayo, VACUUM normal dejó cero tuplas muertas sin devolver toda la asignación. Por eso `n_dead_tup` pequeño no prueba una base pequeña. La historia sintética también recibió UPDATE para estudiar MVCC; no se atribuye ese comportamiento al writer real de historial. Los GIN y la distribución de claves pueden impedir extrapolar linealmente. [Medidas detalladas y comandos](ESPACIO.md).

El duplicado exacto `products_updated_at_idx` / `products_updated_at_desc_idx` ocupa 1.400.832 B por índice. Retirar uno puede simplificar mantenimiento, pero sería sólo ~1,40 MB asignados y no resolvería capacidad. No se retiraron índices ni se infirió desuso por contadores sin ventana fiable.

Una comprobación adicional comprimió el JSON capturado de 5.000 filas históricas: 1.398.382 B → 338.712 B, con descompresión byte a byte idéntica. Esta muestra no es respaldo decimal completo ni demuestra ahorro físico PostgreSQL. La ventaja de gzip corresponde al archivo: no equivale a recuperar bytes de tablas e índices.

## Contratos protegidos y aceptación

Preservar IDs públicos y UUID de oferta, variantes/condiciones de pago, fechas originales y evidencia de origen. Auth queda fuera de una reconstrucción de catálogo. Favoritos, alertas, inventario y cola deben reconciliarse al corte definitivo; sus relaciones y cascadas impiden retirar productos a ciegas. Mantener las nueve fichas fijas G02 y los tres slugs/21 slots editoriales con alternativas, sin reducir denominadores para aparentar cobertura.

No usar las RPC de observación para restaurar: una restauración no renueva ofertas. Una segunda carga idéntica debe agregar cero filas; una clave con contenidos distintos debe detenerse, sin ocultarse detrás de `ON CONFLICT DO NOTHING`. Las comprobaciones de continuidad usan fixtures sintéticas y SQL del repositorio en otra base propia; no implican disponibilidad real ni Auth/OAuth productivo.

Para cualquier futura intervención se requieren: respaldo descargado y restaurado, definiciones/FK/RLS/functions/grants conciliados con remoto, consultas equivalentes a un mismo instante, capacidad para copia temporal/índices/WAL/reserva, ventana y timeout de bloqueo, y rollback que preserve escrituras posteriores. `pg_database_size` no acredita espacio libre de disco. Compactar conserva datos pero puede bloquear tablas y requerir espacio adicional; no se ejecutó en producción. [Supabase: tamaño y mantenimiento](https://supabase.com/docs/guides/platform/database-size), [PostgreSQL 17: VACUUM](https://www.postgresql.org/docs/17/routine-vacuuming.html).

## Reproducibilidad y custodia

Los scripts se versionan; los cuerpos capturados, metadatos completos y recibos permanecen en `tmp/restructuracion-2026-10-08`, excluido de Git, directorio 0700 y archivos 0600. La custodia final de dirección conserva hashes/copia privada. Los reportes sólo publican agregados y límites.

```sh
node --test scripts/pilots/catalog-restructure-capture.test.mjs
node --test scripts/pilots/catalog-restructure-space.test.mjs
node scripts/pilots/catalog-restructure-space.mjs tmp/restructuracion-2026-10-08/input.json tmp/restructuracion-2026-10-08/space-nuevo.json
```

La captura se ejecuta con el entorno server-side autorizado del proyecto, nunca con claves en argumentos o impresas. Su interfaz es `metadata.json salida-nueva.json`; el archivo de salida debe ser nuevo. El laboratorio físico no lee ese entorno.

## Estado de cierre

El laboratorio funcional reaplicó 73 migraciones del repositorio en una base PG17.11 propia con roles/Auth sintéticos. Antes y después de compactar cuatro tablas ejecutó las suites `atomic_catalog_offers`, `adaptive_observations`, `current_offer_evidence` y `current_catalog_price_fastpath`: 12 grupos aprobados, incluidas 30 comparaciones completas de búsqueda, dos comprobaciones numéricas de ocho días del índice y diferencia de historial por cuotas/reintento. Todas las filas de tablas `public/auth` de esa fixture y las definiciones capturadas de columnas/defaults/GENERATED/FK/constraints/índices/triggers/functions/ACL/RLS/policies mantuvieron sus hashes. Esta es continuidad de compactación sobre fixture, no restauración completa del catálogo ni igualdad con definiciones remotas. Auth real/OAuth y usuarios públicos quedan fuera de esta prueba.

Pruebas de aplicación relacionadas: cinco archivos, 128 tests aprobados. Harnesses nuevos: captura cinco, espacio siete, continuidad SQL tres; 15 tests aprobados. Revisión independiente sin materiales abiertos después de corregir validación legacy y NULL de arrays; se reforzó cierre del clúster ante ACK incierto. El recibo físico final `space-result-v3.json` corresponde al código corregido. Comando adicional: `node --test scripts/pilots/catalog-restructure-contracts.test.mjs`. Una ejecución independiente usa `node scripts/pilots/catalog-restructure-contracts.mjs tmp/restructuracion-2026-10-08/contracts-nuevo.json`.

Captura, ensayo físico y continuidad SQL ejecutados localmente. Las medidas no autorizan ni garantizan un tamaño productivo inferior a 450 MB. Capacidad remota, archivo masivo, lectura fría, pico de mantenimiento y publicación siguen abiertos. El resultado de esta entrega cambia la ruta: demostrar un modelo activo más pequeño y recuperable antes de aprobar una cirugía de producción.

Unidades locales revisables: `39f8bc5` captura GET y cinco tests, 165 líneas añadidas; `69db4bc` laboratorio físico y siete tests, 438 líneas; `dfadcb1` continuidad SQL y tres tests, 306 líneas. La unidad física supera el presupuesto orientativo de 400 en 38 líneas: se conservó un harness aislado con sus guardas, integración y reporte, sin recortar verificaciones ni compactar código para ocultar tamaño. Revisión independiente Sol/high concluyó sin materiales abiertos. Rollback de cada unidad retira únicamente sus scripts/tests/docs; ningún servicio remoto depende de ellos. Las correcciones anteriores de rendimiento en `268f979` conservan su estado y publicación pendiente.
