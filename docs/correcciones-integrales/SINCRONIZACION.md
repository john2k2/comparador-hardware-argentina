# Sincronización de observaciones en la candidata local

El catálogo Mac refrescaba CompraGamer y podía conservar una observación vieja de otra tienda aunque el productor ya hubiese guardado una nueva. El puente propuesto sólo consulta el catálogo público de Supabase y aplica observaciones a una copia nueva. Nunca escribe en Supabase, cambia el servicio instalado ni activa el candidato durante la preparación.

## Contrato

- Coinciden ID de oferta, producto, tienda y URL exacta. Se vuelve a demostrar variante desde los nombres completos; una clave heredada no basta.
- Se exige identidad de fuente ligada a la publicación y ausencia de contradicción de SKU o dictamen pendiente. Kit RAM conserva su contrato específico.
- Sólo avanza una fecha real de oferta estrictamente más nueva. No se usa la fecha de producto, consulta, copia o certificación para rejuvenecer precios.
- Stock agotado o desconocido se transporta como tal; no se convierte en disponibilidad.
- No se crean productos ni se trasladan asociaciones. Rechazos quedan contados y explicados.
- Máximo 1.000 filas y cinco GET por ejecución; hasta 64 destinos candidatos de guías se leen primero. La selección textual sólo prioriza, no acredita identidad.
- El barrido inicial considera 24 horas; el cursor mantiene el resto pendiente entre ejecuciones. Tras terminar una ventana, solapa tres horas para recibir observaciones guardadas con demora. Una inserción con más demora requiere conciliación explícita; no se promete cobertura histórica completa.
- `receivedRows` cuenta filas transferidas; `read` cuenta ofertas únicas después de deduplicar la lectura prioritaria. Aceptadas más rechazadas coincide con `read`.
- Cada copia reconstruye estadísticas, bases de precios, índices y certificado antes de poder ser candidata. El origen permanece intacto y su hash vuelve a comprobarse.

## Preparación local

La entrada es `scripts/pilots/mac-catalog-refresh.mjs`. `--upstream-only` evita consultar tiendas; `--upstream-env-file` lee únicamente la URL y clave pública, y rechaza claves privilegiadas. `--repair-catalog-identities` aplica la lista de 13 fichas auditadas sobre otra copia; exige nombre exacto y preserva las tablas de ofertas byte a byte antes de la sincronización.

El job instalado no se modifica. Para una futura activación revisada, la configuración admite `refreshJob.syncUpstream: true` y utiliza `envFile`. Por defecto sigue desactivado. Los recibos del job validan y conservan el número real de lecturas del productor; no declaran cero lecturas remotas cuando hubo sincronización. La recuperación y poda siguen exigiendo hash, puntero y confirmación del servidor.

## Corte inicial histórico, UTC 14/10/2026

Se copió en modo lectura una generación real de 485.167.104 bytes con 59.692 productos, 73.827 ofertas y 34 tiendas. Se corrigieron las 13 fichas permitidas; los hashes de ofertas, bases de precios, resúmenes y tiendas permanecieron iguales durante esa reparación.

| Ciclo | Filas transferidas | Ofertas únicas | Admitidas | Rechazadas | Duración local |
| --- | ---: | ---: | ---: | ---: | ---: |
| v2, incluye reparación de identidad | 1.000 | 1.000 | 672 | 328 | 22,1 s |
| v3, prioridad de guías y continuación | 998 | 998 | 557 | 441 | 20,2 s |
| v6, candidata usada para QA final | 998 | 997 | 473 | 524 | 22,0 s |

El último ciclo leyó 38 filas prioritarias y cinco respuestas GET, 2.755.966 bytes. Una oferta apareció tanto en prioridad como en paginación: se contabilizaron ambas transferencias y una sola decisión. Sus rechazos fueron: 156 fechas no posteriores; 65 variantes de fuente no acreditadas; 184 variantes de producto no acreditadas; 115 identidades de fuente no acreditadas; dos conflictos de destino y dos de SKU. Son cortes sucesivos, no un conteo acumulado de ofertas distintas ni cobertura completa.

En ese corte inicial, el cursor todavía estaba recorriendo la ventana inicial del 13/10 02:49 al 14/10 02:49 UTC, con frontera del 13/10 08:13. La prioridad evita que las guías esperen ese barrido. El catálogo entero no está conciliado por haber aprobado tres lotes.

La integración reveló una diferencia entre JavaScript y SQLite: el primero trunca microsegundos y el segundo puede redondearlos. Se incorporó una política de reloj v2 que conserva el texto original y normaliza sólo la expresión de lectura/indexación. Los intentos v4/v5 se rechazaron antes de producir una candidata por un error al interpretar fracciones cortas con offset; se corrigió y el barrido final comparó **73.827 fechas, sin divergencias**. Los certificados v1 siguen siendo legibles con su expresión original para conservar la posibilidad de volver a una generación anterior.

Los recibos íntegros están en `outputs/correcciones-locales-2026-10-14/candidate-run-v2/promotion.json`, `candidate-run-v3/promotion.json` y `candidate-run-v6/promotion.json`. El archivo `candidate-summary.json` identifica exclusivamente el cierre v6 y separa intentos históricos. `source-receipt.json` identifica el origen, cuyo hash no cambió. No hubo escrituras remotas ni activación productiva.

La candidata v6 tiene generación `mac-refresh-1791948098734`, SHA-256 `b03a465450270b0f508a9a00e8bef35b0be18927243cdea821d354f9ca5fb929` y fingerprint `06826e280ac05ec1409480aa471dbc840527334d0f72445e1d0445289bfcdb12`. Su permiso temporal de promoción venció a las **03:26:27 UTC**. Sirve como evidencia reproducible; para publicar habrá que preparar y certificar un corte vigente. El lector continúa evaluando cada oferta contra la hora de consulta y no renueva su fecha.

## Revisión antes de publicar

Revisar la tasa de rechazo por identidad, preparar un corte vigente y contrastar portada, ficha y tienda en los destinos prioritarios. El barrido al corte documentado abajo terminó; las observaciones nuevas requieren ciclos posteriores. Una lectura reciente de catálogo no equivale a una nueva visita al comercio. La futura publicación y sus ciclos naturales necesitan su propia evidencia; estas pruebas no los sustituyen.

## Barrido terminado y reconciliación de guía, 14/10/2026

Se continuó desde v6 con diez lotes válidos, conservando cada cursor y hash de origen. El lote 8 terminó la ventana inicial del **13/10 02:49:51.960 al 14/10 02:49:51.960 UTC**. Los lotes 9 y 10 terminaron el solapamiento del **13/10 23:49:51.960 al 14/10 04:03:38.451 UTC**, superando el corte objetivo de 03:55:58.550. Ambos cursores quedaron completos.

| Medida acumulada de los diez lotes nuevos | Resultado |
| --- | ---: |
| Filas transferidas, incluidas repeticiones prioritarias | 9.503 |
| Decisiones, deduplicadas dentro de cada lote | 9.490 |
| Ofertas distintas leídas a lo largo del barrido | 7.292 |
| Ofertas distintas admitidas | 3.828 |
| Decisiones rechazadas | 5.662 |
| GET de los lotes exitosos | 49 |
| Bytes recibidos por los lotes exitosos | 26.059.833 |

Rechazos por decisión: 2.026 observaciones no posteriores, 726 variantes de fuente no acreditadas, 1.445 variantes de producto no acreditadas, 1.349 identidades de fuente no acreditadas, 90 ofertas fuera del corte, 21 conflictos de SKU y cinco conflictos de destino. Estos rechazos no se forzaron a entrar. La terminación del cursor no implica que las 73.827 ofertas del catálogo tengan stock, identidad demostrada ni precio reciente.

Hubo dos intentos fallidos del lote 2. El segundo registra HTTP 500; el primero ocurrió antes de agregar el registro de reintentos y conserva su copia de trabajo. No avanzaron el cursor aceptado. Los 49 GET y bytes anteriores excluyen intentos fallidos: no se dispone de su total completo de red. Los reintentos quedaron acotados y utilizaron el último candidato válido.

El origen v6 conserva SHA-256 `b03a465450270b0f508a9a00e8bef35b0be18927243cdea821d354f9ca5fb929`. El resultado del barrido conserva 59.692 productos, 73.827 ofertas y SHA-256 `531a798998f3d53c0ed97f6a7da6223a4ec2297f11ea84c5fca33fe63381e0a9`. Recibos: `outputs/cierre-local-2026-10-14/barrido/checkpoint.json`, `barrido-resumen.json` y `barrido/lote-*/promotion.json`.

Después del barrido, una reparación explícita y separada creó la ficha `cg-17076` y movió únicamente su oferta CompraGamer desde el grupo auditado. No es una facultad del puente genérico de sincronización. Se reconstruyeron los certificados y se observaron las siete publicaciones de la guía con el lector real. La candidata final tiene 59.693 productos y las mismas 73.827 ofertas; véase [GUIA_3M.md](GUIA_3M.md).

Cierre de alcance: cero escrituras remotas, producción sin activar y servicio Mac instalado sin cambios. El barrido es completo para las ventanas registradas; no es un inventario nuevo de todas las tiendas ni garantía de recepción de eventos futuros.
