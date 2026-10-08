# Cold tipado: paridad local demostrada, migración pendiente — 08/10/2026

**La candidata local conserva resultados del índice 7/90/365 y cohorte dinámica en la fixture ensayada.** Es una vía funcional a continuar investigando; no está lista para migrar. El ahorro físico compatible observado fue 65.536 bytes en 1.487 registros sintéticos y falta garantizar UUID global entre tablas y continuidad de escritores. JSONB sigue rechazado por la medición anterior.

Alcance: `scripts/pilots/history-cold-typed.mjs` y este reporte. No se modificó código de aplicación, telemetría ni `ejecución-01`; sin consultas o cambios remotos, refresh, configuración, migración ni publicación. HEAD leído al comenzar: `e6177f6`; la prueba se identifica por hashes de fuente y programa.

## Oráculo, evidencia y límites de fuente

| Fuente / corte | Identificación |
|---|---|
| RPC del repositorio | `supabase/migrations/20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql`; SHA-256 `2d973b12469b5f923686865b4e54e0a975ef18f7d125871016d6499604476dae`. |
| Definición publicada informada por coordinación, 08/10 **20:56 UTC** | MD5 de `pg_get_functiondef`: `690e0fd5f366627d274ab78416463312`. El replay local devuelve **exactamente ese MD5**; no se asumió igualdad por nombre de función. |
| Definición local canonicalizada | SHA-256 `cc0cb89906cc612c8ce670f0442d973796f567f8e4c3cde427557d8c2597e19f`. |
| Programa, 261 líneas | `scripts/pilots/history-cold-typed.mjs`; SHA-256 `2ed84fd8716f55aa649b48003255c95bb183ff37bdb6cb76ab8bb5348398d0e1`. |
| Fixture independiente textual | 1.487 observaciones / 30 productos; SHA-256 `155c3da7d94a4493697dcc52f0869224732b1774ebe6976422ee8be160f18999`. Día Buenos Aires `2026-10-08`; fechas se construyen en SQL conservando microsegundos. |
| Recibo final, **21:17:02.059 UTC** | `tmp/drenaje-telemetria-2026-10-08/cold-typed-TIrP9X/receipt.json`; SHA-256 `e936f6ad0da00fea3868d71e5f6911973b84e7c808f69567055ef89b2e0ba159`. |

No se usa la muestra JSON del laboratorio anterior para demostrar paridad, ni datos de usuarios/ofertas reales. El hash publicado fue informado por coordinación; esta unidad no realizó una lectura remota independiente ni verifica runtime del sitio.

## Candidata ensayada

- Mantener `public.price_history` como tabla física hot, con sus seis índices. Se comprobó su OID antes/después de mover filas: sin rename ni reemplazo por vista.
- Cold tipado de ocho columnas con UUID PK e índice `(product_id,store_id,offer_url,recorded_at DESC)`. Dinero `numeric(14,2)`, original firmado/null, cuatro estados de stock, timestamp real y URL NULL/vacía/exacta (`scripts/pilots/history-cold-typed.mjs:17`).
- Ambas tablas conservan FK producto con UPDATE/DELETE CASCADE y tienda con UPDATE CASCADE/DELETE RESTRICT. No dependen de la existencia de una oferta actual.
- Unión experimental con `security_invoker=true`; clones del SQL de la RPC cambian **únicamente** nombre de función y relación histórica: referencia completa, hot+cold y dos controles negativos. Los filtros actuales, orden, mínimos, mediana y días Buenos Aires se mantienen (`scripts/pilots/history-cold-typed.mjs:94`).
- Movimiento local atómico de observaciones anteriores al corte exclusivo `2026-07-10T21:16:58.288007Z`: 1.167 cold y 320 hot. Cold conserva todas las antiguas, incluidas anclas de 400/500 días; no ejecuta retención ni compactación semántica diaria.

Las tablas padre son un catálogo sintético mínimo; se ejecutó como postgres en el clúster aislado. No demuestra RLS/grants productivos ni un mecanismo seguro de exposición de la unión.

## Pruebas y sensibilidad del oráculo

**42 comparaciones de cinco columnas, `EXCEPT ALL` en ambos sentidos: cero diferencias.** Catorce estados × horizontes 7/90/365: antes del split, después, once mutaciones independientes y después de compactar sólo el clúster propio.

| Grupo | Evidencia observada |
|---|---|
| Cohorte dinámica | Stock out/unknown, precio actual cero, cambio/exclusión/promoción de categoría, URL alternativa/vacía/sin historia, reactivación con ancla vieja y retiro de oferta. En los 33 cortes mutados, el oráculo cambió frente a la cohorte inicial y la candidata coincidió. |
| Oráculo numérico independiente | CPU 7 d tiene ocho fechas, medianas esperadas 150/140/200/135 según día y conteos definidos a mano. Almacenamiento prueba mínimo por producto, precio histórico cero que interrumpe oferta y conteo de ofertas separado. |
| Integridad / home / restore | 1.487 filas y ocho campos iguales entre referencia y hot+cold; UUID distintos en ese estado. Home de últimas 24 h: mismas 25 filas. Restore dos veces conserva exactamente las 1.487 filas. |
| FK y precisión | Updates de padres en cascada, borrado de tienda restringido y de producto en cascada. Precio máximo/original negativo, null, microsegundos, empates por UUID, stock, URLs separadas y cotización futura preservados sin inventar disponibilidad. |

Los controles negativos se ejecutaron para 365 días y **deben** diferir:

| Control incorrecto | Filas sólo en referencia / sólo en control |
|---|---:|
| Leer únicamente hot | 1.454 / 24 |
| Omitir anclas anteriores al inicio de 365 d | 1.352 / 24 |
| Retener sólo última observación por día UTC | 2 / 2 |

Gate comprobado adicional: insertar en hot un UUID ya presente en cold fue aceptado por sus PK independientes y produjo **una duplicación en la unión**; el ensayo se revirtió. El split observado es disjunto, pero no impide futuras colisiones/restore. No presentar ese estado como unicidad global implementada.

## Espacio físico y consulta

| Estado local | Filas hot/cold | Tabla(s), incluido TOAST/mapas | Índices | Total |
|---|---:|---:|---:|---:|
| Tabla completa recién cargada | 1.487 / 0 | 221.184 B | 581.632 B | 802.816 B |
| Baseline completo compactado | 1.487 / 0 | 196.608 B | 409.600 B | **606.208 B** |
| Split lógico, sin recuperar hot | 320 / 1.167 | 376.832 B | 647.168 B | **1.024.000 B** |
| Hot+cold compactados localmente | 320 / 1.167 | 204.800 B | 335.872 B | **540.672 B** |

Cold final: heap 147.456 B, tabla 155.648 B, índices 163.840 B, total 319.488 B; hot total 221.184 B. TOAST de cada tabla: 8.192 B, incluido en sus cifras. UUID/PK e índice de oferta/FK están presentes; no se incluye registro global de IDs ni tablas auxiliares comunes del laboratorio.

La comparación justa es 606.208 →540.672 B: **65.536 B** del layout en esta fixture. Los otros 196.608 B se recuperan compactando la tabla completa sin separar. El split lógico primero **aumenta** el espacio; no extrapolar ahorro, pico real/WAL ni tiempo de bloqueo a producción. `VACUUM FULL` aquí fue sólo local y no autoriza mantenimiento remoto.

| Horizonte | Oráculo completo, rango de 3 ejecuciones SQL | Candidata hot+cold |
|---|---:|---:|
| 7 d | 7,865–8,302 ms | 7,824–8,133 ms |
| 90 d | 9,120–16,709 ms | 8,051–12,588 ms |
| 365 d | 16,021–16,271 ms | 14,724–15,451 ms |

`EXPLAIN ANALYZE/BUFFERS` serial, conexiones locales nuevas, sin red externa; incluye trabajo/planning interno de PL/pgSQL. La referencia temporal tiene PK e índice de oferta; los seis índices del hot completo son el baseline de espacio. No son percentiles ni prueba de mejora pública. CPU/memoria de PG no aisladas; CPU Node 61.138/238.867 µs user/system y RSS final 60.686.336 B corresponden al controlador, no al servidor.

## Cierre y siguiente acción

Pasaron `node --check` y ejecución real PG17.11 propia sin TCP. La primera corrida se detuvo por una FK incompleta en la fixture de `product_prices`; se corrigió CASCADE y repitió. Recibo final exitoso; clúster detenido y directorio temporal propio retirado, salida `0700` y recibo `0600`. Ejecución final 4.411 ms. Programa + reporte: menos de 400 líneas.

Recomendación: **continuar la vía tipada como candidata local, sin preparar aún una migración productiva**. Siguiente unidad: resolver/probar unicidad y transferencias hot/cold con concurrencia y restore, ejecutar contratos de escritores actuales y medir una distribución histórica adecuada antes de presupuestar capacidad. Mantener respaldo exacto, anclas y home24h; no congelar cohortes ni borrar originales para cerrar el gate.
