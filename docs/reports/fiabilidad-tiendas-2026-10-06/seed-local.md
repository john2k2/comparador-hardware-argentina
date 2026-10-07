# SQL seed: entrega local y límites

Corte 2026-10-07 02:39 UTC / 06-10 23:39 Santiago. Copy/branch `comparador-confianza`, `codex/fiabilidad-todas-tiendas`, base dcefbe7. Asignación posterior de coordinación: nueva migración, test SQL, test concurrente y benchmark local exclusivo. Sin lectura/escritura remota, refresh, publicación, commits o cambios a instrumentación ya entregada.

## Decisión concreta

Se entregan dos índices covering **generales** para preparar la cola sin leer payload de productos/ofertas cuando las páginas permiten index-only scans. Archivo creado con `supabase migration new catalog_seed_covering_indexes`: `supabase/migrations/20261007023548_catalog_seed_covering_indexes.sql` (17 líneas). SQL de función, GUC de función, invoker, permisos, retorno int/ROW_COUNT, máximo500 escrituras/lote, caller200lotes, leases/retry y frescura intactos. La DDL usa SET LOCAL lock_timeout2s/statement_timeout30s sólo durante la transacción de migración; no configura roles ni servidor. Si falla una construcción, revierte ambas.

El coordinador aceptó la unidad mínima y explícitamente decidió mantener el error ante una categoría discrepante bajo lock. No usar SKIP LOCKED que podría devolver0 con diferencias pendientes. Este frente no modifica caller ni contrato.

**Estado:** índices y regresiones locales probados; mejora de lectura demostrada en heap con visibilidad; **recuperación runtime no demostrada, beneficio no garantizado bajo churn**. El benchmark no reproduce8s del proyecto remoto ni demuestra reducción de errores en producción. Los logs remotos aportados por dirección sí confirman statement timeout en tres cancelaciones57014, no origen de CPU/IO/lock de cada una.

## Matriz sintética y recursos

PG17.11/Homebrew local (proyecto remoto17.6); instancia propia 127.0.0.1:55473; base `catalog_seed_test`. Replay de todas las migraciones previas. Sintético, sin copia de datos DB real:59.160productos,73.291ofertas,20fuentes, cola completa. Descripción/specs/URLs determinísticos con md5 para payload ancho. Las FK/triggers originales siguen instalados; carga masiva sintética usa session_replication_role=replica **sólo dentro de esa carga local**, prepara cola explícitamente y luego VACUUM ANALYZE local. Esto aísla el coste seed, no mide la importación real.

Antes de índices nuevos: heap products96.903.168bytes, PP58.548.224bytes,queue5.611.520bytes; tamaños totales253.018.112/264.478.720/8.937.472bytes. Índices nuevos2.965.504+4.325.376=7.290.880bytes. Memoria/disco/CPU de Mac propios, sin equivalencia a plan Free remoto. Los índices añaden almacenamiento y mantenimiento de escrituras; cuota libre real pendiente de dirección. No proponer gasto ni cambiar plan.

Tres repeticiones por estado; SQL/GUC mismos (jitoff,work_mem32MB,nestloopoff,mergejoinoff); statement timeout8s sólo de sesión local. Cada RPC benchmark en transacción con rollback. Tiempos de EXPLAIN ANALYZE son ejecución DB en esta instancia; no wall total de red, p95 ni SLA.

| Estado | SELECT baseline ms | SELECT covering ms | RPC baseline ms | RPC covering ms |
|---|---|---|---|---|
| Cola completa | 41.282–48.365 | 27.342–31.292 | 37.705–39.172 | 23.316–24.694 |
|501faltantes |42.216–43.310 |11.890–12.182 |41.394–42.384 |13.890–14.062 |
|10.000faltantes |21.854–22.030 |11.238–11.846 |23.077–23.426 |13.202–13.643 |
|501categorías discrepantes |sin medición baseline en esta matriz |11.761–12.056 |sin medición baseline |12.862–13.551 |

Cola completa: nodos3SeqScan/2HashJoin→2IndexOnlyScan/SeqScanqueue/2HashJoin; heap fetches0; total bloques hit+read19.661→1.637. Temporal0 en ambos. Primer SELECT covering tiene884reads, posteriores0; caché explica parte de los tiempos. No transformar esta comparación en ratio de mejora productiva.

**Control de churn:** actualizar10% filas uniformemente de products/PP, ANALYZE sin VACUUM. Covering volvió3SeqScan,21.625bloques,SELECT45.535–80.999ms/RPC40.869–44.082ms. Sin índices (DROP sólo en transacción local y rollback),3SeqScan/21.625bloques,SELECT44.787–47.729/RPC41.382–44.833. El primer covering tomó más lecturas; estos tiempos no establecen una regresión causal del índice, pero **no hay beneficio de buffers en ese estado**. Para producción verificar `relpages/relallvisible`, plan y buffers de mismo corte. No forzar index-only ni VACUUM remoto desde este encargo.

Datos completos: `seed-benchmark-result.json` (planes, RPCs y churn), `seed-benchmark-summary.json`, `seed-benchmark-churn.json`. Scripts reproductores propios: `seed-benchmark.sql`, `seed-benchmark.mjs`, `seed-benchmark-churn.mjs`. Harness secuencial, no compatible con ejecución repetida sobre base ya poblada; preparar base vacía por instrucciones antes de repetir.

**Control mixto adicional solicitado por dirección:** VACUUM sólo PP local, conservar products con churn. Corte localproducts5.913/13.012páginasallvisible (45,44%; denominadorpáginasdeeseheap),PP7.862/7.862(100%),queue751/751. Sincovering:3SeqScan,21.625bloques,SELECT48.007–49.979ms/RPC44.051–45.189. Concovering:SeqScanproducts/queue eIndexOnlyPP(heapfetch0),14.430bloques,SELECT41.416–44.322/RPC37.843–39.422. Prueba mejora de lecturas PP aunque products requiera heap. Es conservador respectoavisibilidad de products, no réplica de hardware/carga/IO de producción. Datos en `mixedVisibility` delJSON y `seed-benchmark-mixed.json`; script`seed-benchmark-mixed.mjs`.

Coordinador entregó corte remoto adicional: PP4.724/4.730páginasallvisible,products5.945/8.959,queue995/998; lecturas individuales deplanbaselinePP3121ms/products378ms/q533ms. La oportunidad principal de este corte es evitarheapPP; conservar GUC y noatribuir sumatiemposcausacompleta deRPC. Este frente sóloleyólaevidencia de dirección, no consultó cuenta/DB remota.

## Regresiones ejecutadas

Base limpia `catalog_seed_replay` en el mismo cluster aislado: todas las migraciones cronológicas, incluida la nueva. `bounded_catalog_queue.sql` aprobado y `catalog_seed_covering.sql` aprobado:501/500/1/0,20fuentes, productos de mantenimiento y combo con catalog_component=false, índices generales válidos con INCLUDE correctos, categoría discrepante500/1/0, lease/attempt/retry intactos, invoker/anon/auth/service_role iguales.

`catalog-concurrency.test.mjs`: **3/3** aprobados,10.577s total. Nueva prueba: categoría distinta con reserva activa y lockFORUPDATE externo; seed con lock_timeout200ms/statement_timeout2s de test falla conlocktimeout, fila no aparece reconciliada; despuésliberarlockseed1/0 y reserva/retry intactos. Los otros tests confirman escritores de ofertas coherentes y que fila sin diferencias bloqueada no bloquea seed. El límite probado **no repara locks discrepantes**: el error evita falsear cola completa y la instrumentación conserva causa.

ESLint del archivo concurrente y gitdiffcheck propios aprobados. Nueva unidad:17líneas migración+57testSQL+34líneas concurrentes=108autorales, menor400. No fullverify/build/typecheck/browser propios, coordinación integra. Es preciso incorporar nuevo testSQL al replayCI; este frente no tiene ownership delworkflow.

Fallos de ensayo corregidos: segunda base en mismo cluster no puede crear roles ya existentes; se reutilizaron roles y ejecutó sólo parte de auth de bootstrap. Primer fixture asumió que todo periférico tenía catalog_component=false; la regla actual devuelve true en periféricos. Se corrigió la fixture agregando combo realmente excluido, manteniendo periférico; se repitieron ambosSQL con éxito. No se cambió la regla productiva.

## Comandos exactos ejecutados y uso de instancia propia

Cluster inicial: binarios de `/opt/homebrew/opt/postgresql@17/bin`, data/log en `tmp/fiabilidad-tiendas/seed-pg`. `initdb -D tmp/fiabilidad-tiendas/seed-pg/data -U seed_local --auth=trust --encoding=UTF8 --no-locale`; `pg_ctl -D ... -l .../server.log -o '-h 127.0.0.1 -p 55473 -k /tmp' start`. Puerto libre comprobado antes. Se creó postgres local superuser y basecatalog_seed_test, se ejecutó bootstrapcompleto y todaslasmigracionesanterioresanueva. Luego fixture y benchmark (crea ambosíndicesenbasebench), luegochurn.

Base replay, después de crear nueva migración:

```sh
/opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 55473 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -c 'create database catalog_seed_replay owner postgres;'
# Roles de bootstrap ya existían en este cluster; auth es por base:
sed -n '6,$p' supabase/tests/bootstrap-local.sql | /opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 55473 -U postgres -d catalog_seed_replay -X -v ON_ERROR_STOP=1
for migration in supabase/migrations/*.sql; do
  /opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 55473 -U postgres -d catalog_seed_replay -X -v ON_ERROR_STOP=1 -f "$migration" || exit 1
done
/opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 55473 -U postgres -d catalog_seed_replay -X -v ON_ERROR_STOP=1 -f supabase/tests/bounded_catalog_queue.sql -f supabase/tests/catalog_seed_covering.sql
PGHOST=127.0.0.1 PGPORT=55473 PGUSER=postgres PGDATABASE=catalog_seed_replay node --test supabase/tests/catalog-concurrency.test.mjs
./node_modules/.bin/eslint supabase/tests/catalog-concurrency.test.mjs
```

Logsretenidos:seed-pg/replay.log,replay-new.log,fixture.log,sql-tests.log,concurrency-tests.log,benchmark-errors.log,churn-errors.log. Sin credenciales remotas. Cluster sigue disponible hasta coordinación termine verificaciones; el owner puede detener únicamente esta instancia con `pg_ctl -D tmp/fiabilidad-tiendas/seed-pg/data stop -m fast`.

Siguiente acción: integrar/revisar108líneas, incluirtestenCI y decidir publicación/aplicación con cuota/visibilidad real. Si se aplica, medir SELECT/seedporciclonatural sobreversióncorrelacionada, sin agrandartimeout/retries. Si visibilidadbaja o runtime siguecancelando, estosíndices no cierran bloqueo: volver aplan/coste y acordar otraunidad de reconciliación acotada. La cobertura y confianza de tiendas permanecen abiertas.
