# Historial frío: integridad global medida localmente

La unicidad global puede imponerse mediante registry tipado y transacciones, pero esta candidata **pierde el ahorro físico** de la fixture. No recomiendo convertirla en una migración para aliviar capacidad. La unidad local cierra con evidencia de integridad dentro del contrato probado y con beneficio físico refutado en ese conjunto; producción, concurrencia general y ahorro global permanecen abiertos.

Corte final: **2026-10-08T21:37:28.521Z**, PostgreSQL 17.11 local, copia `codex/capacidad-costo-cero`. Sólo se escribieron `scripts/pilots/history-cold-integrity.mjs` y este informe. Sin consultas de red, credenciales, cambios remotos, publicación ni edición del laboratorio previo. El README de dirección faltaba en la copia gestionada; se leyó su versión en la copia principal como contexto.

La fixture sintética de 1.487 filas reutiliza declaraciones puras del laboratorio previo, verificadas por SHA256 antes de ejecutarlas: `scripts/pilots/history-cold-integrity.mjs:61`. No procede de un CSV independiente ni representa la distribución productiva de 250.606 filas. La definición canónica local de `hardware_price_index(integer)` coincide con el MD5 live aportado por coordinación a las 20:56 UTC: `690e0fd5f366627d274ab78416463312`, comprobación en `scripts/pilots/history-cold-integrity.mjs:81`.

## Contrato implementado exclusivamente en el laboratorio

`cold_lab.history_ids` contiene UUID PK y ubicación booleana: `scripts/pilots/history-cold-integrity.mjs:17`. Hot mantiene nombre físico, OID, ocho campos y seis índices; cold mantiene ocho campos, PK UUID y un índice de oferta/fecha. Ambos conservan FK de producto CASCADE en actualización/borrado y tienda CASCADE en actualización/RESTRICT en borrado. Se agregan dos FK de historia a registry, sin columnas nuevas en historia.

Antes de insertar, el trigger adquiere la fila de registry mediante UPSERT. Una ubicación distinta rechaza el UUID con SQLSTATE 23505; la misma ubicación deja actuar a la PK y a `ON CONFLICT` de la tabla. El borrado elimina registry sólo si todavía corresponde a esa tabla. Un constraint trigger diferido verifica al cierre exactamente una fila de historia y ubicación coincidente. El UUID se declara inmutable y su UPDATE se rechaza: restricción explícita que los escritores probados no necesitan.

El movimiento bloquea primero registry y después la observación, cambia ubicación y ejecuta DELETE+INSERT en la misma transacción: `scripts/pilots/history-cold-integrity.mjs:34`. La restauración bloquea el mismo UUID, consulta el destino actual y compara los ocho campos; repetir la fila exacta no añade nada y cambiar contenido bajo ese UUID falla: `scripts/pilots/history-cold-integrity.mjs:43`. No se usa una garantía probabilística de generación UUID.

**Incompatibilidad comprobada:** `INSERT INTO price_history ... ON CONFLICT(id) DO NOTHING` no ignora un UUID que reside en cold: el trigger falla antes de la PK hot. El restore debe enrutar por registry bajo lock; no puede conservar sin cambios ese mecanismo hot-only. Los escritores actuales probados generan UUID nuevos y conservan sus INSERT a hot.

## Pruebas reales y alcance

- EXCEPT ALL de los ocho campos en ambos sentidos tras el split: cero diferencias; 320 hot + 1.167 cold = 1.487 UUID únicos.
- Tres nuevas comparaciones exactas de RPC, horizontes 7/90/365: cero diferencias. Las 42 pruebas de cohorte dinámica pertenecen a la unidad tipada anterior; no se cuentan nuevamente aquí ni prueban el RPC público hot-only tras una migración.
- Colisión entre tablas rechazada; hot `ON CONFLICT DO NOTHING` aceptado sin duplicar; hot `DO UPDATE` y movimiento con ROLLBACK restituyen los ocho campos y ubicación exactos.
- Restore completo repetido dos veces mantiene filas; un mismo UUID con precio cambiado se rechaza. Cambio directo incorrecto de ubicación se rechaza al forzar constraints diferidos.
- Tres carreras con dos actores independientes: movimiento vs inserción del mismo UUID, movimiento vs restore y restore vs movimiento. Se observó el bloqueo mediante `pg_blocking_pids`; cada carrera terminó sin duplicados, huérfanos ni ubicación incorrecta. Un lector independiente durante la transacción vio la historia completa anterior, sin diferencias respecto de la referencia.
- Se compilaron funciones existentes desde sus migraciones sin modificar sus cuerpos: catálogo general y wrapper actual, prioridad/verificada, solicitada/verificada con lease y adaptativa con lease. Cada cambio añadió una observación hot y cada repetición añadió cero: ocho ejecuciones, cuatro filas nuevas.
- Actualización de IDs de padres CASCADE, borrado de tienda RESTRICT y borrado de producto CASCADE pasaron sin huérfanos de registry. La retención actual hot-only con ventanas 1/2/3 días borró 293 de 324 filas dentro de una transacción revertida; antes del rollback quedaron 1.198 observaciones y entradas registry, sin duplicados/huérfanos y con constraints forzados. Se probó además borrar una fila cold y restaurarla exacta en una transacción confirmada.
- Estado final, incluidas cuatro observaciones nuevas: **1.491 filas = 1.491 entradas registry; cero duplicados, huérfanos o destinos incorrectos**.

Fuentes de prueba: split/tamaños en `scripts/pilots/history-cold-integrity.mjs:89`; colisiones/restore en `:112`; carreras en `:121`; escritores en `:148`; cascadas/retención en `:173`. Los hashes de las ocho migraciones se guardan en el recibo. Esquemas de padres/leases son mínimos; `catalog_identity_text` es un stub local y no se valida su normalización. No se reprodujeron los triggers reales del read model, RLS, permisos service_role ni todo el esquema productivo.

## Coste físico: comparación compactada contra compactada

`pg_total_relation_size` incluye heap, índices y almacenamiento auxiliar. El baseline fue compactado **antes** de añadir registry o mover filas; ninguna diferencia se atribuye a compactar sólo un lado.

| Relación compactada | Filas | Heap | Tabla con auxiliares | Índices | Total bytes |
|---|---:|---:|---:|---:|---:|
| Historia completa, seis índices | 1.487 | 188.416 | 196.608 | 409.600 | **606.208** |
| Hot, seis índices | 320 | 40.960 | 49.152 | 172.032 | 221.184 |
| Cold, dos índices | 1.167 | 147.456 | 155.648 | 163.840 | 319.488 |
| Registry, UUID PK + boolean | 1.487 | 81.920 | 81.920 | 65.536 | 147.456 |
| **Hot + cold + registry** | 1.487 observaciones | 270.336 | 286.720 | 401.408 | **688.128** |

El registry consume 147.456 bytes: supera los 65.536 de diferencia favorable de hot+cold sin unicidad global. El resultado completo requiere **81.920 bytes adicionales** respecto de la historia completa compactada. No hay fundamento para anunciar ahorro global con esta candidata.

Tras instalar registry y triggers, `pg_database_size` creció de 9.221.811 a 9.418.419 bytes; ese delta incluye registry y asignaciones de bloques de catálogos, no un precio exacto por trigger. Los objetos nuevos incluyen cinco funciones, trece triggers contando los ocho de FK y cuatro constraints. Tuplas lógicas medidas: triggers 2.041 bytes, funciones 3.502, constraints 805; no equivalen al espacio físico incremental de índices/TOAST de `pg_catalog`.

Durante la transacción que movió las 1.167 filas se observaron **1.359.872 bytes** entre hot (606.208), cold (417.792) y registry (335.872); después del COMMIT conservaban ese tamaño hasta compactar. Delta WAL al punto de muestra: **1.102.368 bytes**. Esto contabiliza el crecimiento transaccional observado, pero no certifica el máximo de WAL total al COMMIT, rollback, backups o reescritura durante VACUUM FULL. Tampoco autoriza mantenimiento remoto.

La ejecución completa tardó 6.381 ms, incluidos tres sleeps deliberados de 1,5 s para demostrar contención. CPU de Node: 38.441 µs usuario/116.782 µs sistema; RSS final 61.521.920 bytes, sin máximo muestreado. No se midieron CPU/RSS de PostgreSQL, red ni latencia de usuarios; no se atribuye una mejora de rendimiento a estos datos.

## Evidencia, límites y decisión

Recibo privado: `tmp/drenaje-telemetria-2026-10-08/cold-integrity-JTsqrN/receipt.json`; directorio 0700 y recibo 0600. SHA256 del script: `032773ad54279a2f14c2d0aa71999ad45e6314963b6b83fc4bffaee68c9c110b`. SHA256 del recibo: `b049459defbc9f0704fb1b0c559a521b5f39089c6ed23c00052eead1ccf4a55a`. Dependencia tipada sin editar: `2ed84fd8716f55aa649b48003255c95bb183ff37bdb6cb76ab8bb5348398d0e1`.

Pasaron `node --check`, la ejecución real final y `git diff --check`. Hubo un primer fallo local al convertir directamente dos tipos compuestos de tablas diferentes; se corrigió usando ROW explícito de ocho campos. Los recibos previos se conservaron. Cada clúster propio usó socket corto privado, `listen_addresses=''`, entorno mínimo sin credenciales, y quedó detenido y retirado.

La garantía demostrada cubre DML con triggers activos y las funciones internas probadas. Un superusuario que desactive triggers o ejecute TRUNCATE queda fuera de ese contrato. El orden registry→historia de move/restore puede competir con historia→registry de cascadas/cleanup; no se probaron esas carreras ni se implementaron retries de deadlocks. Search path, grants y RLS de una implantación real requerirían otra revisión. La retención fría y la política de anclas no se implementaron; el RPC público se dejó intacto.

**Siguiente acción para coordinación:** detener esta variante como solución de ahorro, conservar el laboratorio como evidencia y revisar el frente de compactación ya asignado. Reabrir una arquitectura cold requeriría evidencia representativa que compense registry, migración/rollback y mantenimiento, además de resolver la incompatibilidad de restore y el orden completo de locks. No corresponde seguir añadiendo complejidad para defender los 65.536 bytes previos que desaparecieron al completar el contrato.
