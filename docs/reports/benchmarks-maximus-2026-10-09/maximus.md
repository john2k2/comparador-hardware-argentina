# Maximus: diagnóstico y corrección local de persistencia

La lectura Maximus de ITEM12032/SKU100-100000593WOF, terminada el 10/10/2026 a las 01:18:02.752 UTC (09/10 en Santiago), produjo ARS 339.300, `special`, `in-stock`. La función adaptativa capturada en producción devuelve `false` para esa condición porque Maximus no figura entre las siete tiendas permitidas. El piloto ejecutó ese rechazo en PostgreSQL local y comprobó que la fila anterior no cambió. Después de la migración propuesta, la misma observación con su fecha original se guardó y resultó comparable tanto en SQL como en el mapper de lectura y la regla de la aplicación.

## Alcance

- Port selectivo de la unidad `07e81972ca65313018d254dbfc8acb6088597d74`: diagnóstico lógico global/tienda/progresivo/final para `true`, `false`, error, excepción y respuesta inválida. No incorpora otras unidades de aquella rama ni cambia el número de reintentos.
- `true` cuenta observación guardada y compara usando las reglas existentes. `false` sin incertidumbre identifica rechazo; un error seguido de `false` mantiene ACK incierto. Los códigos están acotados, y no se copian textos externos, URLs ni credenciales al diagnóstico.
- Migración creada con `supabase migration new`: `20261010011643_allow_maximus_observed_special_price.sql`. Reemplaza una sola lista en la definición validada por MD5. Si el contrato cambió, aborta con `MAXIMUS_PERSIST_BASELINE_CHANGED`.
- El hash `f66ccd0f002da0ddf8b8b4f8e8ecd992` coincide tanto con la definición remota capturada como con la recreación limpia del historial del repositorio. Se probó la aplicación de la migración sobre ambas bases.
- Conserva el cuerpo restante, propietario, `SECURITY INVOKER`, `search_path=pg_catalog,public` y ACL de la función. No crea tablas ni amplía permisos.
- El lector Maximus no requirió cambios. La moneda ARS, SKU, ID y bindings de precio/pago siguen siendo corroborados por el lector antes de persistir.

## Evidencia local

El padre capturó dos solicitudes públicas de Maximus, sin escritura remota: HTML y `web.MAX.GetItemDetail_V6`. El piloto verificó sus hashes, ejecutó `parseMaximusKnownDetail`, pasó el producto por `fetchKnownOffer` real con transporte aislado, ejecutó el contrato SQL remoto en una base propia PG17.11, leyó la fila, ejecutó `mapDbProduct` y verificó comparabilidad/frescura. No reemplazó la fecha de observación ni presentó la fixture del 07/10 como vigente.

El piloto rechazó la fixture histórica ITEM13444 antes de persistir y mantuvo su fecha histórica. El producto guardado de ITEM12032 conserva título literal, `maximus:id:12032`, source ID `12032`, SKU `100-100000593WOF`, ARS 339.300 y 01:18:02.752 UTC. El producto JSON de lectura posterior y el producto anterior al rechazo están en `evidence/maximus-persisted-product.json` del directorio de trabajo.

Resultados:

- 105 unit tests aprobados: 60 del runner adaptativo, 11 de diagnósticos y 34 del lector Maximus. Incluyen caminos completos ACK `true`/`false`/error/reintento/excepción/invalid, dos tiendas y cuatro combinaciones de condición/stock Maximus. No mockean la regla de comparabilidad del runner.
- 30 controles del piloto PostgreSQL aprobados: baseline false sin modificar fila; stock, identidad y fecha literales; lease incorrecto/expirado; run viejo; observación vieja/futura; precio cero; stock inválido; identidad ausente; listing ausente; las cuatro plantillas `{{ITEMTIT}}`, `ITEMTIT`, `<%`, `§`; condición inválida; conservación de las siete tiendas previas y rechazo `special` Venex; retry sin historial duplicado; stock desconocido guardado y no comparable; agotado guardado; `unspecified`; comparabilidad SQL/app; ACL privada; deriva de baseline.
- Lint de los cuatro archivos TypeScript de esta unidad aprobado. Sintaxis del piloto y `git diff --check` aprobados.
- Typecheck general final aprobado, con dependencias que coinciden con el lock y Next16.3.8. El entorno inicial incompleto se corrigió antes de la verificación integrada.
- Replay de CI completo:83/83 migraciones, incluidas el tablero privado y esta migración;15/15 regresiones SQL, runner de precios actuales y2/2 casos de concurrencia. Se usó exclusivamente el bootstrap del repositorio, sin grants extra ni BYPASSRLS; rol service_role sin superusuario. Recibo y log: `../evidence/sql-ci-replay.json` y `sql-ci-replay.log` respecto del repositorio.
- UI en servidor construido:4/4 casos Maximus aprobados a1440px y390px. La fixture contiene exactamente el producto leído después del SQL local y el control de la API pública, con fechas originales y reloj explícito. La oferta guardada aparece a339.300; la rechazada no se presenta como reciente, no recibe ratio ni genera ganador. El ratio individual del control vigente sí se conserva. Es reproducción de una captura real, no una escritura productiva.

## Reproducción

Desde la raíz del repositorio, usando los artefactos de lectura guardados por el padre:

```sh
npx vitest run src/lib/catalog/adaptive-refresh.test.ts src/lib/catalog/persistence-diagnostics.test.ts src/lib/scrapers/maximus-known-detail.test.ts
node scripts/pilots/maximus-persistence-regression.mjs ../evidence/persist-adaptive-offer-before.sql ../evidence/maximus-persistence-regression.json
```

La base de pruebas nace en un directorio `/tmp` propio, con permisos 0700 y socket Unix, `listen_addresses=''`, sin conexiones TCP. El proceso no importa dotenv ni hereda variables PG/credenciales. Limpia exclusivamente su cluster al terminar. La observación original debe seguir dentro de la ventana temporal del contrato al repetirlo; si vence, obtener una nueva lectura pública autorizada o anclar explícitamente un reloj de laboratorio, nunca redatar el artefacto existente.

## Operación propuesta y reversión

La unidad está preparada localmente; aplicar SQL o desplegar requiere autorización fuera de esta corrección. La operación productiva propuesta es únicamente la migración indicada, precedida por la comprobación del MD5 y ACL vigentes. La guardia de la migración impide sobrescribir otra revisión. Tras aplicación, comprobar definición, único cambio en la lista, propietario, search path y ACL. Una lectura de definición por sí sola no demuestra una observación guardada: una eventual validación de refresh debe aprobarse por separado y cotejar la fila observada y comparable, no sólo ACK.

La reversión del contrato es volver a ejecutar exactamente `evidence/persist-adaptive-offer-before.sql` (la definición previa capturada; cuerpo sin editar, con terminador SQL), dentro de una transacción con los mismos límites de lock y statement. `CREATE OR REPLACE FUNCTION` conserva propietario/ACL; comprobar después MD5 `f66ccd0f002da0ddf8b8b4f8e8ecd992` y ACL `{postgres=X/postgres,service_role=X/postgres}`. Esa reversión no elimina ni refecha observaciones que se hubieran guardado mientras la corrección estuviera activa.

## Límites

PG local es17.11 (Homebrew); el remoto observado es17.6.1.063. El piloto focal de30 controles recreó el esquema relevante y concedió permisos locales amplios con BYPASSRLS; esa prueba, por sí sola, no acredita todas las políticas RLS ni los permisos de tablas productivos. La segunda ejecución independiente reprodujo todas las83 migraciones y regresiones de CI con el bootstrap original, sin esos permisos extra. Ambas tienen recibos separados. No se copiaron datos productivos privados. La muestra pública prueba precio/stock en su instante de lectura y puede cambiar después. No se ejecutaron escrituras SQL remotas, refresh remoto, despliegue, push ni cambios de permisos externos.
