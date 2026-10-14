# Sincronización incremental del catálogo: piloto local

Corte: 11/10/2026. Implementado y probado en la Mac; sin operación remota, costo contratado, cambio de producción ni renovación ficticia de ofertas.

`incremental-sync.mjs` recibe dos capturas completas verificadas de las cuatro tablas públicas (`stores`, `products`, `product_prices`, `catalog_price_summaries`). Verifica SHA256, filas, terminación en página vacía, IDs únicos y relaciones. Compara hashes canónicos de cada fila por ID exacto y genera altas, cambios y bajas. Preserva identidad, stock y fechas originales; rechaza retrocesos de observación. Una captura ausente/incompleta nunca autoriza bajas. El manifiesto y la terminación acreditan integridad de la captura recibida, no que el remoto la exportó atómicamente ni que una publicación siga comprable.

El destino debe existir. Antes de escribir, se verifican la generación esperada, el marcador de la captura, el checkpoint y todas las filas materializadas de SQLite, incluidas las bases histórica/actual de ofertas y FTS. Se valida que cada oferta de un resumen coincide con su registro real de precio, tienda, URL, stock y fecha. `in-stock` y `low-stock` pueden pertenecer a la base comparable; `unknown` y `available-on-backorder` no. La elegibilidad temporal sigue siendo responsabilidad del motor y de su reloj, sin inventar una observación.

**Precondición de integración: ambas fuentes deben haber pasado previamente por la certificación de identidad del catálogo.** Este applier comprueba integridad y coherencia de los datos recibidos; no implementa ni certifica la guardia estructural `identity_review`/`source_identity` frente a nombre, SKU y variante del producto. Una oferta con URL de otro modelo puede conservar una tupla internamente coherente y superar esa validación de integridad. La certificación previa con la guardia PostgreSQL y su evidencia es un paso separado obligatorio; no presentar `loadIncrementalSnapshot()` como verificador de identidad exacta.

La aplicación completa usa una transacción SQLite offline. Actualiza únicamente columnas materializadas que cambiaron y las filas FTS/bases de ofertas afectadas. Invoca `rebuildProjection(db,{now,generation,affectedProductIds})` dentro de la misma transacción: incluye caducidades del reloj y pares de identidad, y conserva el cache/generation marker al publicar. Precio, proyección, invalidación de caché y checkpoint se confirman juntos. Un fallo de proyección, integridad, presupuesto o escritura revierte todo. Repetir un checkpoint confirmado verifica el destino y ejecuta cero escrituras. Una captura idéntica tampoco escribe; el avance independiente del reloj es una operación separada del mantenimiento de la proyección.

La API rechaza un delta sin callback de proyección cuando el marcador del destino contiene `projectionVersion=1` o caché. Lo hace antes de ejecutar escrituras, para evitar conservar proyecciones y HIT anteriores después de cambiar el precio. La verificación sin callback se permite con hashes de origen y destino idénticos.

## Ejecución

Requiere Node con `node:sqlite`, las dependencias ya instaladas y una **copia SQLite offline**, nunca la base que otro proceso está sirviendo. No instala dependencias ni lee `.env` o credenciales. La CLI planifica por defecto:

```bash
node scripts/pilots/cloudflare-catalog/incremental-cli.mjs \
  BEFORE_SNAPSHOT AFTER_SNAPSHOT OFFLINE_SQLITE NEW_REPORT.json
```

El reporte contiene `baseGeneration`, hashes antes/después por ID, operaciones parametrizadas, IDs afectados y grupos máximos de 49 statements. Para aplicar localmente se exige la generación leída del plan:

```bash
node scripts/pilots/cloudflare-catalog/incremental-cli.mjs \
  BEFORE_SNAPSHOT AFTER_SNAPSHOT OFFLINE_SQLITE NEW_APPLY_REPORT.json \
  --apply --expected-generation BASE_GENERATION_HASH \
  --max-estimated-writes 80000
```

`--now ISO` permite un reloj de laboratorio explícito. Omitirlo usa `referenceNow` de la captura nueva; **no convierte ese reloj en `last_updated`**. Los reportes no se sobrescriben. La API `snapshotGeneration(manifest)` produce la generación de origen como SHA256 canónico de counts/hashes; el cache marker añade el reloj de la proyección.

Los statements usan parámetros, menos de 100 bindings y límite de tamaño por statement de 100 KB. El resultado aplicado incluye `committedStatements`, inclusive proyección y marcadores, para revisión/reproducción. Los grupos describen límites, **no son un uploader D1 remoto seguro**: dividirlos sobre la generación activa podría exponer un estado parcial. Una futura publicación remota necesita staging/checkpoints, control de concurrencia y una conmutación de generación comprobada. El único mecanismo integrado de publicación atómica de este módulo es la transacción SQLite local.

## Presupuesto y evidencia

Una sentencia no equivale a una fila escrita. Se distinguen:

| Métrica | Origen y alcance |
|---|---|
| `baseRowsWritten` | Cambios directos medidos, incluidos marcadores y proyección; no representa consumo D1 |
| `sqlitePhysicalRowsChanged` | `total_changes()` de SQLite, incluidos cambios de tablas auxiliares FTS y triggers; no cuenta mantenimiento BTree |
| `estimatedIndexRows` | Modelo conservador: dos filas por índice afectado y fila cambiada; altas/bajas/upsert cuentan todos los índices. UPDATE cuenta sólo índices cuyas columnas, expresiones o predicados parciales intersectan las columnas SET. Usa PRAGMA index_list/index_info y SQL del esquema; ante una expresión desconocida conserva el costo. No afirma equivalencia exacta con facturación |
| `estimatedRowsWritten` | Cambios físicos SQLite + modelo de índices; si supera el máximo indicado, rollback |
| `d1RowsWritten` / `d1RowsRead` | `null` en el applier: no se consultó D1 remoto |
| `localRowsScanned` | Escaneo de validación en la Mac; no se atribuye a cuota D1 |

El máximo por ejecución de 80.000 se complementa con `chargeDailyBudget`: **80.000 acumuladas por día UTC** en `pilot_daily_write_budget`, compartida con el mantenimiento del reloj en la misma copia offline. Suma cuatro operaciones estimadas de overhead, no carga no-ops, rechaza aumentar el techo registrado y retroceder el día, y revierte todo si excede el presupuesto. El ledger se confirma dentro de la transacción del delta, debe conservarse entre ejecuciones y no puede repartirse entre copias independientes para afirmar un límite de cuenta. La CLI lo activa siempre al aplicar; una carga inicial grande se rechaza. **No garantiza la cuota disponible de una cuenta ni su facturación real**: hay que descontar otras cargas y verificar índices/CPU remotos. [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) documenta 5 millones de lecturas/100.000 escrituras diarias e impacto de índices; [límites D1](https://developers.cloudflare.com/d1/platform/limits/) documenta bindings y tamaño de consulta. Consultados el 11/10/2026.

Pruebas ejecutadas:

- **21/21 pruebas, cero omitidas (16 incremental y 5 ledger):** no-op, precio/fecha real, stock, altas/bajas completas, observación fallida, rechazo de fechas que retroceden, unknown/backorder, integridad de captura y destino, checkpoint repetido/base desactualizada, rechazo previo de delta sin callback en una generación proyectada, rollback de proyección/presupuesto, límites/bindings, estimación de índices por columnas SET/predicados parciales, acumulación diaria, medianoche UTC y reversión del ledger. Una nueva fecha a mismo precio actualiza sólo row_json del precio sin estimar índices de precio; un cambio exclusivamente next_transition estima sólo projection_clock_idx.
- **No-op del snapshot certificado completo:** 59.692 productos, 73.827 precios, 57.548 resúmenes, 34 tiendas; 369.226 filas materializadas verificadas en SQLite, **cero escrituras**, 8.49 segundos de procesamiento local. Generación `9dab611d95d8cc4f52f365521cd7c8967c11fc40714782f2d4fb87e6cd606a81`. No se alteró esa copia ni la captura.
- **Fixture pequeña en Miniflare/workerd D1 local, versión con ledger:** cambio de precio y documento FTS, 11 cambios directos, 19 cambios físicos SQLite, `meta.rows_written=20`, `meta.rows_read=16`, 12 statements incluida creación inicial del ledger; modelo conservador 32 escrituras. Un fallo deliberado al final de un batch revirtió el cambio anterior. Los artefactos anteriores sin ledger son antecedentes. El contador local **no verifica el costo BTree/factura de D1 remoto**; no extrapolar esta fixture a la renovación diaria completa.
- **Segunda captura real certificada:** 20 productos, 20 ofertas y 20 resúmenes actualizados; los precios siguieron iguales, cambiaron observaciones y algunos metadatos. Reproducción con presupuesto compartido: 104 cambios directos, 269 escrituras estimadas incluidas reservas. El ledger acumuló 3.444 para reloj previo y delta. Reintento del checkpoint confirmado: cero escrituras. Comparación del nuevo corte con PostgreSQL privado: 50/50 consultas. Validación D1 local de los veinte registros y fechas; detalle en [BUSQUEDA_GRATIS_VALIDACION_LOCAL.md](BUSQUEDA_GRATIS_VALIDACION_LOCAL.md).

```bash
node --test scripts/pilots/cloudflare-catalog/incremental-sync.test.mjs
```

Persisten pendientes: medir diferencias durante ciclos diarios completos (la segunda captura cubre minutos); carga inicial gratuita distribuida; actualización real de precios de todo el catálogo; runner y cadencia del reloj/proyección; costo de índices y CPU en runtime remoto; cuota compartida; publicación por generación y recuperación después de interrupción. Un plan incremental correcto reduce escrituras repetidas, pero no demuestra por sí mismo que 73.827 ofertas puedan renovarse diariamente en D1 gratis.
