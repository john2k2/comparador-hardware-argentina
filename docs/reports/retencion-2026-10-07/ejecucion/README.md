# Piloto ejecutado: 1000 eventos vencidos

Jonathan autorizó continuar la recomendación concreta con «ok continua con tu recomendacion». El coordinador ejecutó exclusivamente el piloto ya presentado: `operational-store-event`, corte fijo **07/10/2026 14:30 UTC**, máximo cuatro transacciones de 250. El registro de ejecución empieza a las **12:17 Santiago** y la comprobación posterior es de las **12:21:36**. **El límite está alcanzado: no ejecutar otro lote con esta autorización.**

[registro.json](registro.json) contiene preflight, ensayo revertido, cuatro respuestas de commit y postflight. [autorizacion.json](autorizacion.json) registra el alcance humano. Las cuatro respuestas individuales se conservan como `lote-1.json` a `lote-4.json`; son evidencia histórica, sin datos de ofertas, usuarios, payloads ni claves de caché.

## Resultado conciliado

| Medida | Antes | Después |
|---|---:|---:|
| Filas de toda la caché | 348.342 | 347.342 |
| Filas elegibles en el scope y corte del piloto | 330.295 | 329.295 |
| Filas activas o en el límite del corte, en toda la tabla | 1.689 | 1.689 |
| Filas del scope actualizadas después del corte | 0 | 0 |
| Tamaño físico de la base, bytes | 929.205.395 | 929.205.395 |
| Caché total, bytes | 245.424.128 | 245.424.128 |
| Heap principal de caché, bytes | 158.253.056 | 158.253.056 |
| Índices de caché, bytes | 77.922.304 | 77.922.304 |

Cada commit informó **250 filas eliminadas**, todos tuvieron respuesta reconocida y el total fue **1000**. No hubo error, respuesta perdida ni reintento. El ensayo anterior terminó en ROLLBACK y la lectura posterior comprobó que los contadores iniciales seguían iguales. Los 1.689 registros protegidos corresponden al corte fijo y a toda la tabla; no son un indicador de actividad presente.

Los tiempos de cliente de cada llamada fueron 1,8–2,0 segundos; no son duración SQL, p95 ni un benchmark. `startedAt` y `acknowledgedAt` del registro incluyen la coordinación entre llamadas, por lo que su diferencia no sustituye ese tiempo.

## Operación y límites

Antes de borrar se verificaron permisos del rol operador, RLS activo y ausencia de triggers de usuario, reglas de reescritura o claves foráneas entrantes. Cada transacción mantuvo scope/corte fijos, `FOR UPDATE SKIP LOCKED`, revalidación del predicado, `statement_timeout=3s`, `lock_timeout=200ms` y límite 250. La guarda de autorización y el máximo acumulado se revisaron antes de cada commit; el máximo acumulado es procedimental, respaldado por el registro, no un contador SQL persistente.

[El borrador original](../cache-vencida-piloto.sql) y [el ensayo revertido](ensayo-rollback.sql) conservan ROLLBACK. Para los cuatro commits se cambió el terminador bajo la autorización registrada. Estos archivos documentan la operación; no son un permiso para repetirla ni para limpiar las 329.295 filas elegibles restantes.

Las filas eliminadas eran telemetría vencida. No se borraron historial de precios, ofertas, productos ni usuarios; no se aplicaron índices, VACUUM, ANALYZE, migraciones, cambios de plan o refresh manual. No se demuestra restauración de esos eventos después del commit. La eliminación lógica no recuperó bytes físicos medibles en este corte.

## Comprobación del servicio y próxima decisión

[publico-despues.json](publico-despues.json), corte 12:23:32 Santiago: pasaron cinco GET del sitio público: home, búsqueda filtrada, listado CPU, ficha Ryzen 5600 y armador. Las dos APIs devolvieron doce resultados cada una. Es una comprobación proporcional después del piloto, sin otra auditoría de navegador ni certificación de stock/compra. La búsqueda tardó 5,6 s en esa petición; no se presenta como mejora de performance.

**El piloto está cerrado; capacidad y continuidad siguen abiertas.** [El diagnóstico de capacidad](../capacidad/PLAN.md) conserva los tamaños, alternativas y condiciones. El siguiente trabajo es demostrar un ciclo natural de la versión publicada y preparar retención de historial aislada con límites y recibos reales; cualquier eliminación adicional o recuperación física exige una operación distinta, revisable y autorizada.
