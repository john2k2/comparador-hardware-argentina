# Automatizaciones y scripts — corte local 07/10/2026

**Actualización de coordinación al cierre:** las seis unidades U1/U2/A1/U3/A2/A3 ya están integradas en commits locales. Los estados «pendiente»/«sin commit» del relato conservan el corte de entrega del especialista; el estado final, los recibos y los límites están en [README.md](README.md). Código no publicado.
Estado inicial: diagnóstico local. **A1 fue integrada localmente por coordinación; A3 tiene corrección local probada**, por encargos posteriores; A2 tiene implementación local probada por coordinación; A4 y A5 siguen propuestas. Sin publicación ni ejecución remota. Revisión `638d6dad0a72fc591b273bc97a02e025964d441a`, rama `codex/optimizacion-automatizaciones`, copia `/Users/johnortiz/.codex/worktrees/comparador-confianza/comparador-hardware-argentina`. La dirección identifica `99d5917` como publicación vigente; este agente no contrastó el despliegue ni las cuentas en runtime. Presupuesto: costo cero. Comparar un componente y armar siete piezas conservan igual prioridad.

Encargo: inventariar invocadores, cron y scripts; detectar trabajo redundante y riesgos concretos; proponer 3–5 correcciones con pruebas y ownership. Escritura autorizada solamente en este documento y `inventario-scripts.json`. El encargo inicial dejó código de lectura. El coordinador luego asignó escritura sólo en `src/lib/catalog/scheduler.ts` y `scheduler.test.ts` para A1; workflows, DB/RLS, seguridad y demás código continúan de lectura. Sin subdelegación.

## Inventario y flujo

[inventario-scripts.json](inventario-scripts.json) contiene **30/30 archivos de `scripts/`, 6/6 workflows, 21 comandos npm y ocho soportes**, con SHA-256, líneas, invocadores, clasificación y efectos. Los scripts de prueba y helpers también se incluyen. Un archivo histórico bajo `docs/reports/` no se toma como automatización activa por existir allí; los harness históricos no forman parte de los 30 scripts del directorio ejecutable.

| Invocador configurado | Cadencia UTC | Trabajo y límites | Exclusión / evidencia |
|---|---|---|---|
| `catalog-refresh.yml:40` | 05:05 diario `priority`; minuto 17 las otras 23 horas `guides` | Node, ofertas conocidas; muestra fija sólo diaria; otros modos manuales usan Next loopback; `cleanup-history` manual borra historial | Grupo `catalog-refresh`; job 30 min; artefactos 30 días |
| `catalog-adaptive-refresh.yml:3` | Minuto 41 cada hora | Node, inventario/cola, hasta 2500 ofertas por defecto, 17 min de procesamiento | Grupo propio; job 24 min; artefacto 7 días |
| `requested-offer-refresh.yml:5` | Cada cinco minutos, 02…57 | **Condicionado** por variable de repositorio `ENABLE_ON_DEMAND_REFRESH=1`; preflight antes de instalar; hasta dos jobs de ocho ofertas | Comparte grupo `catalog-refresh`; job 20 min; artefactos 30 días |
| `measurement-snapshot.yml:3` | 06:43 diario; minuto 07 horario | Diario: lecturas agregadas de cuentas y snapshots privados; horario: sólo home; escribe DB | Grupo `measurement-snapshots`; 5 min; no artefactos de cuentas |
| `eneba-pilot.yml:3` | 01/05/09/13/17/21:29 | Seis filas de feed y persistencia de selección; sin ampliación del piloto | Grupo propio; 4 min; artefacto 30 días |
| `verify.yml:3` | Push main, PR o manual | Lint/types/unit/ops; PostgreSQL aislado con migraciones; navegador crítico | Grupo por ref, cancela anterior; 20 min |
| `wrangler.jsonc:21` → `custom-worker.mjs:23` | Minuto 11 horario | Lee GitHub y sólo despacha adaptativo; **RPC de guarda sí muta rate limits**; no scraping en Worker | 75 min desde cualquier inicio listado; 1 permiso/3600 s; cron habilitado en configuración |

Estas son cadencias **de configuración**; el corte de cuentas proporcionado luego por coordinación se distingue debajo. Nominalmente se definen 24 priority/guides, 24 adaptativos, 288 requested condicionados, 25 measurement y seis Eneba por día (367 triggers de workflows), más 24 observaciones Cloudflare. No son minutos consumidos, costo, filas modificadas ni un ahorro estimado. La variable del repositorio para requested no se leyó.

`run-catalog-refresh.mjs:7-17` compila una entrada TS y ejecuta Node con el entorno heredado. Su entrada principal cubre adaptive/requested/priority/guides; las entradas independientes son import-interest/inspect-sources/verify-listings/eneba-pilot. `import-interest` es manual: no hay un workflow de importación semanal entre los seis presentes. Eso delimita lo implementado, sin afirmar que una cuenta o tarea externa lo haya ejecutado.

Integración con el otro frente: `measurement-collect.mjs:20-39` guarda vista y home; el trigger diario también guarda home, por lo que esa escritura comparte destino con el cron horario, pero aún no se demostró redundancia inútil. `custom-worker.mjs:4-21` integra cache documental, auth Edge, home observado y lecturas measurement antes de Next. Esos módulos los revisa el otro especialista; no se repitió su auditoría profunda aquí.

No eliminar cron complementarios sólo por tener nombres parecidos. Guías, actualización general, demanda de usuarios, portada y medición tienen criterios distintos. La exclusión y las consultas caras son mejores candidatas de trabajo que una reescritura o un proveedor pago.

## Cinco correcciones recomendadas

### A1 — P1: recuperar el turno del respaldo que llega segundos antes de vencer su guarda

**Hecho y trigger:** `scheduler.ts:58-67` consume `check_api_rate_limit` antes del dispatch; la RPC inicia una ventana deslizante en `now()` (`20260306203742_shared_cache_and_rate_limits.sql:56-100`). El cron no está alineado con ese timestamp real. El recibo previo del 07/10 a las 16:11:26.998 UTC devolvió `deferred`; la ventana previamente medida terminaba 16:11:32.516 UTC. Fuentes: `docs/reports/retencion-aislada-2026-10-07/lectura/scheduler-tail.json` y README de esa entrega, líneas 47–51. Es una colisión con la guarda propia; no evidencia de retraso GitHub, fallo de scraper ni ausencia de run.

**Efecto:** si no hay trabajo reciente/activo, perder por unos segundos la RPC posterga el siguiente intento hasta otro evento horario. Un POST rechazado o con respuesta perdida también conserva la ventana, pues el gate se adquirió antes (`scheduler.ts:68-73`). El test existente sólo comprueba que dispatch 403 falla (`scheduler.test.ts:56-60`), no la continuidad posterior.

**Reproducción segura ejecutada:** bundle del scheduler real en memoria, logger aislado y fetch falso. Primer gate a 15:11:32.516, dispatch 403; segundo evento a 16:11:26.998 devuelve `deferred`, `retryAfterSeconds=6`, un único POST. Cero HTTP, escrituras o secretos reales. Un run completed de edad 60 min devuelve `recent`: el guard de **75 minutos** (`scheduler.ts:54-55`) ya hace que el respaldo aislado, muestreado por hora, tienda a dos horas entre sus propios inicios; se conserva esa intención, no se cambia a una promesa de frecuencia horaria.

**Corrección viable propuesta:** conservar las dos guardas, no liberar/reiniciar bucket, no repetir dispatch. Cuando un gate válido niegue y devuelva un vencimiento inmediato (por ejemplo hasta 10 s), permitir una sola espera acotada, después reconsultar GitHub y la misma RPC. Si aparece run reciente/activo, omitir. Si la segunda guarda niega o vence el presupuesto total, terminar `deferred`. La RPC ya devuelve `resetAtMs` y `retryAfterSeconds` tanto en allowed true como false (migración citada:85-100). Registrar sólo campos numéricos saneados y etapa/resultado propios.

Un rechazo HTTP definitivo y timeout/respuesta perdida deben tener diagnóstico distinto. **No liberar una guarda ante resultado ambiguo:** el dispatch podría haberse aceptado; reintentar ciegamente abre duplicación. Esta propuesta sólo recupera la proximidad al vencimiento natural y conserva el control distribuido.

**Ownership recomendado:** ingeniería en `src/lib/catalog/scheduler.ts` y `scheduler.test.ts`; sin tocar custom-worker, wrangler ni migraciones. Coordinador debe confirmar presupuesto total del evento scheduled antes de implementación. El contrato local del worker espera la promesa (`custom-worker.mjs:23-24`); no se confirmó aquí una cifra de wall time/CPU de Cloudflare. Se respetó la prohibición de HTTP, incluida consulta de documentación remota. Tipos/plantillas locales no acreditan el límite productivo.

**Pruebas de cierre propuestas:** reloj y espera inyectables; negativa a 6 s / 11 s; una sola espera; fecha inválida/negativa; retraso de timer y presupuesto agotado; run aparece durante espera; dos eventos coincidentes y sólo un gate ganador; error definitivo vs timeout sin liberar; segunda negativa; se mantiene 75 min; cero logging de headers/cuerpos. Luego un recibo natural autorizado que distinga `sent` de ejecución completada.

### A2 — P1: el timeout del wrapper puede dejar al job fallido sin artefacto

**Hecho y trigger:** `run-catalog-refresh.mjs:18-22` mata al hijo con SIGTERM a 90 s/8 min/19 min. `refresh-entry.ts:12-20` escribe el artefacto sólo cuando el runner retorna o lanza una excepción. No hay receipt propio del padre para muerte por señal, fallo de bundle o spawn, ni escalamiento del kill si el hijo ignora SIGTERM. El directorio temporal se elimina al terminar (`run-catalog-refresh.mjs:23`).

**Efecto demostrable por estructura:** el hijo interrumpido antes de writeFile no produce el JSON esperado; upload con `if: always()` no crea datos inexistentes (`catalog-adaptive-refresh.yml:47-54`, `eneba-pilot.yml:30-37`). No se atribuye a este camino ningún incidente histórico sin recibo. Los límites suaves de los runners no equivalen al timeout del proceso: una espera SDK puede sobrepasarlos.

**Corrección viable:** el padre guarda un receipt mínimo y saneado cuando falta la salida, con modo, timestamps reales, causa propia y señal/código. Conservar cualquier resultado existente, escribir atómicamente y no inventar acumulados ni estado DB cerrado. Temporizador de escalamiento sólo para el proceso creado por ese wrapper, sin terminar otros procesos. Cancelar timers/listeners en finally. Validar modo/argumentos antes de crear temporales. No dar salida cero a deadline como si fuera cobertura completa.

**Ownership recomendado:** ingeniería en `scripts/run-catalog-refresh.mjs` y prueba offline nueva del wrapper. No modificar los runners de dominio para solucionar transporte del hijo.

**Reproducción y cierre propuestos:** stub de build/spawn y reloj congelable, salida 0/1, spawn error, SIGTERM efectivo, hijo ignora señal, fallo de bundle, output válido existente, output ausente y limpieza. Ningún stub carga Supabase ni scraper. No se ejecutó el wrapper mutante en esta auditoría.

### A3 — P2: el diagnóstico global de frescura se repite cada hora y sus observaciones son de ventana, no de autoría del run

**Hecho y trigger:** cada ejecución priority/guides llama `catalog-freshness-report.mjs` (`catalog-refresh.yml:310-323`). El reporte ejecuta **cuatro exact counts por cada tienda**, hasta las que tienen cero ofertas (`catalog-freshness-report.mjs:27-48`); pagina todas las filas actualizadas en la ventana (`:51-60`) y la muestra (`:79-86`). Con N tiendas son 4N exact counts por invocación, además de lecturas/páginas. Hay 24 invocaciones configuradas diarias: 96N exact counts, condicionado a que el workflow alcance el step. No es una medición de costo SQL.

**Efecto:** el cron de guías vuelve a hacer un diagnóstico del catálogo completo aunque sólo refresque ofertas conocidas de guías. Además, adaptativo tiene grupo distinto (`catalog-adaptive-refresh.yml:20-22`) y puede actualizar `product_prices` durante esa ventana. El reporte cuenta por `last_updated` sin identificador de productor: su `observedRows` **no prueba** que su propio run haya observado esas filas. Los exact counts tampoco comparten una transacción/snapshot único; lecturas concurrentes pueden producir un corte internamente variable. Los conteos ausentes ya fallan de forma explícita (:41-44), conducta que debe conservarse.

**Corrección viable:** modo de reporte acotado para `guides`: resultados propios del runner + elegibilidad de sus piezas y muestra cuando corresponda. Reservar el reporte global actual para el ciclo diario, mantener igual denominador y definición y conservar timestamps de los cortes; un reporte omitido no es cero. Exponer separadamente `observacionesDelRunner` y `filasActualizadasEnVentana`; no imputar las segundas al run. No introducir RPC/índices/migraciones para esta optimización. La reducción de consultas debe comprobarse en un transporte falso antes de estimar capacidad.

**Ownership recomendado:** ingeniería en `scripts/catalog-freshness-report.mjs`, su test y `catalog-refresh.yml`, contrato de evidencia revisado por catálogo/coordinador. Esta entrega no cambia la meta, las ventanas 3 h/24 h, stock o identidad.

**Reproducción y cierre propuestos:** cliente falso de varias tiendas con conteo de requests; rama guides no hace exact counts globales; priority conserva el reporte diario; timeout/count ausente no convierte a cero; otro runner actualiza una fila y no se acredita como observación propia; equivalencia de campos de muestra y G02. `freshness-report-cli.test.mjs:13-107` aporta fixture local de referencia, pero no se ejecutó su servidor ni writes temporales en este encargo.

### A4 — P2: requested y guías compiten por una exclusión común antes de comprobar si hay demanda

**Hecho y trigger:** `catalog-refresh.yml:50-52` y `requested-offer-refresh.yml:11-13` usan exactamente `catalog-refresh`, con cancel-in-progress false. Requested programa cada cinco minutos y **su preflight está dentro del job** (:22-40), luego de entrar al grupo del workflow. Los jobs pueden durar 20/30 minutos, aunque sus entradas trabajen con presupuestos menores. La petición en cola vence a 30 minutos (`20260922010000_requested_offer_refresh.sql:12`); el lease de job reclamado es 10 minutos (:64).

**Efecto confirmado de configuración:** dos responsabilidades distintas comparten la misma exclusión y el preflight no puede verificar vacío hasta que el job arranca. Bajo ejecución larga/backlog, la demanda de armar PC puede esperar por guías o viceversa. **No se acreditaron pérdidas/cancelaciones de pending ni frecuencia real**: requieren logs y semántica vigente de Actions que esta auditoría sin HTTP no verificó. Tampoco se comprobó la variable del repositorio; cron configurado no significa job habilitado.

**Corrección viable para decidir con evidencia:** medir/registrar created_at, run_started_at, inicio de preflight y expiración de solicitud; comparar con los 30 minutos. Revisar una exclusión propia requested sólo después de demostrar compatibilidad de persistencias/leases con priority, que toca las mismas ofertas; no separar grupos a ciegas. Alternativa sin escritura simultánea: un coordinador de runners que priorice jobs de usuario y guías dentro de sus mismos límites. No imponer al armador prioridad inferior por ser una cola menor.

**Ownership recomendado:** coordinador define contrato y catálogo/ingeniería verifican idempotencia; escritor único de ambos workflows. No hay cambio de concurrencia autorizado aquí.

**Reproducción y cierre propuestos:** simulador local de cola (sin GitHub) para workflow largo + llegada cada cinco minutos + solicitud de vida 30 min, más prueba SQL aislada de dos productores sobre igual oferta si se decide concurrencia. Lectura autorizada posterior de runs/colas para confirmar que el caso ocurre y cuantificar atraso. No llamar a esta propuesta solución comprobada de un incidente.

### A5 — P2: `npm run cache:warm` no puede resolver su módulo TS

**Hecho y reproducción segura ejecutada:** `package.json:22` hace `require('./src/lib/server/cache-warming')`; el archivo es `cache-warming.ts`. Con el Node local del checkout, sólo `require.resolve` (sin importar/ejecutar el módulo) devuelve **MODULE_NOT_FOUND**. El comando npm queda roto antes de calentar nada. No se corrigió el módulo de caché ni se leyó en profundidad, pues pertenece al otro frente.

**Corrección viable:** encauzarlo por una entrada Node compilada como los runners existentes, con opción de dry-run y autoridad de ejecución explícita; preservar el contrato de warmHomePageCache. No añadir dependencia paga ni resolver con una exposición pública.

**Ownership recomendado:** especialista de caché para la semántica; ingeniería integra el comando en package y su entrypoint sólo cuando reciba asignación de archivos. Reproducción propuesta: resolución/compilación de entrada con warm sustituido por stub, propagación de exit 1 y cero llamadas al módulo real. El resultado local no certifica compatibilidad en otro Node sin repetir resolución.

## Aspectos preservados y riesgos secundarios

- No se encontró en estos seis YAML una instrucción de push/deploy automático propia; `verify` valida, y los runners persistentes escriben datos. Workers Builds es una configuración externa, no queda certificada por esta ausencia. Los comandos npm deploy/upload sí publican y se inventariaron como mutantes.
- Las acciones tienen `contents: read`; las referencias de secretos se inspeccionaron como código, sin leer valores de cuenta/entorno. Permisos efectivos de tokens, RLS y exposición de RPC no fueron auditados aquí; no se propone una migración de seguridad.
- `measurement-fixture-fetch.mjs:21` permite fallback al fetch original. Es un harness de prueba, no una garantía universal de cero red. La clasificación de fixture no autoriza ejecutarlo con cuentas reales. Mantener la revisión profunda en el frente de medición.
- `verify.yml:49-79` ya corre unidad, ops y SQL aislado, pero `package.json:9` no incluye scripts en lint. Pruebas de scripts no cubren automáticamente cualquier CLI manual. Es una mejora secundaria de calidad, detrás de continuidad y receipts.
- El preflight requested comprueba sólo queued no vencidos; limpieza de fallidos/vencidos vive en la RPC claim (`20260922010000_requested_offer_refresh.sql:60-61`) y también parte en request (:42-43). Si cesan entradas no se demuestra limpieza recurrente de toda la tabla. No activar una limpieza remota para subsanarlo sin encargo.
- La meta adaptativa, la PC comercial completa, la retención externa y G02 siguen abiertas. QA `verify-*-offer-confidence.mjs` comprueba comparación/regreso y carga armador, y declara `commercialBuildVerified:false`; no equivale a siete piezas comprables.

## Verificación ejecutada, límites y siguiente paso

Se comprobó rama/HEAD/status antes del trabajo y se preservó el árbol limpio previo. Se leyeron AGENTS de la copia, dirección/ORQUESTACION de primary, los 30 scripts y seis workflows, scheduler/tests, y dependencias inmediatas para guardas/resultados. No se utilizó un grafo generado ni se creó otra automatización.

Ejecutado: `node --check` de 25 scripts MJS y dos soportes (custom-worker y test de concurrencia SQL); parseo TS en memoria de los cinco scripts TS vía esbuild; **27 checks MJS y cinco parseos, cero fallos**. La comprobación de sintaxis no ejecuta módulos y no acredita sus efectos. Fixture del scheduler real compilado en memoria aprobó rechazo/deferred/75 min; resolución de cache:warm reprodujo MODULE_NOT_FOUND. Cero HTTP/RPC, entrypoints mutantes, migraciones/DDL, DB, refrescos, lectura de cuentas, builds Next, navegador o suites pesadas.

No hay una cifra de ahorro ni un porcentaje de fiabilidad. Todos los hashes corresponden al código de la revisión local auditada; artefactos históricos conservan fecha propia. Los timeouts previos de GitHub (`lectura/natural-final.json`, 16:13:15 UTC) dejan runs desconocidos y **no prueban ausencia**. No se certificó un ciclo nuevo completo de `99d5917`.

Archivos cambiados por este agente: `src/lib/catalog/scheduler.ts`, `src/lib/catalog/scheduler.test.ts`, `docs/reports/automatizaciones-codigo-2026-10-07/automatizaciones.md` e `inventario-scripts.json`. Estado: diagnóstico local y A1 local probado; no integrado, publicado ni verificado en runtime de la candidata.

**Siguiente acción concreta del coordinador:** revisar el diff A1 ya probado y conservar su estado local hasta integración y publicación autorizadas; su cierre productivo requiere un evento natural con recibo, sin dispatch manual. En paralelo lógico posterior, asignar receipt del wrapper A2 y reporte acotado A3. Antes de tocar exclusión A4 obtener evidencia de espera y contrato de escritores compartidos. Conciliar A5 con el informe del especialista de caché. Cada cambio debe cerrar primero en fixture local; publicar o ejecutar un runner mutante requiere autoridad separada.


## A1 implementada después del diagnóstico

Asignación posterior del coordinador: sólo scheduler y su test. `scheduler.ts:10-17` define presupuesto de aplicación **60 s** y señal por request de **hasta 8 s**, recortada al restante; `:45-101` usa reloj monotónico, una espera como máximo (6 s produce 6100 ms; 10 s produce 10000 ms), relee GitHub, vuelve a la misma RPC y omite nuevos POST cuando vence el presupuesto. Los retornos y los tres argumentos existentes se conservan; un cuarto argumento opcional permite congelar reloj/espera en tests. No se liberan buckets ni se reintenta dispatch. Si el temporizador entrega tarde, el scheduler responde deferred al reanudarse, sin trabajo nuevo; el código no promete que un runtime pausado ejecute exactamente al milisegundo.

La coordinación contrastó documentación oficial el 07/10/2026: [duración de Cron Triggers](https://developers.cloudflare.com/workers/platform/limits/#duration) y [scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/), que dan un límite de wall time de 15 minutos para scheduled. El límite de aplicación de 60 s es más estricto; esto no acredita CPU efectiva ni la candidata en Cloudflare. Este agente no abrió esas URLs: usó la evidencia expresa del coordinador.

Verificación final de A1: **39 pruebas focales aprobadas**, un archivo, 119 ms; ESLint de ambos archivos aprobado; TypeScript completo con `--noEmit --incremental false` aprobado; `git diff --check` aprobado. Diff de los dos archivos de código: 198 inserciones / 36 eliminaciones (234 líneas modificadas). Sin commit, nueva dependencia, modificación de custom-worker/wrangler/workflows/migraciones ni operación remota. Warning de configuración futura de Vite y deprecación `module.register()` provienen del entorno de tests; no fallaron las comprobaciones. Los hashes iniciales del scheduler se conservan como `audit_sha256`; `sha256` de esos dos soportes identifica la candidata.

## Corte de cuentas agregado obtenido por coordinación

Recibos locales leídos, sin abrir cuentas ni ejecutar HTTP desde este agente: `tmp/automatizaciones-codigo-2026-10-07/github-workflows.json`, **16:38:48.875 UTC**, seis workflows en estado active; `github-runs.json`, **16:39:30.940 UTC**, tres últimos runs por workflow. Active confirma habilitación del workflow, no aprobación de su job condicionado ni éxito de sus mutaciones.

- `catalog-refresh` run **37652691808**, schedule, `99d5917`, success, creado 16:31:19 y terminado 16:32:52 UTC. Esta conclusión verde no acredita observaciones propias, siete piezas ni G02; artefacto en lectura por coordinación.
- Adaptativo: el último run de ese listado sigue siendo **37626593331**, workflow_dispatch, `2dc40b8`, 13:11:43–13:29:32 UTC. No se infiere run nuevo de `99d5917` ni ausencia futura.
- Measurement **37631985891**, schedule, `2dc40b8`, failure, 13:52:25–13:53:05 UTC. Coordinación ubica fallo en Guardar lectura con install correcto y continúa la investigación; no se adjudica causa desde este frente.
- Requested **37618052605**, schedule, `2dc40b8`, success, 12:01:16–12:01:24 UTC. Ocho segundos no demuestran ofertas procesadas ni activación efectiva; el job/preflight puede omitir trabajo.
- Coordinación informa metadata Supabase agregada en lectura de tres segundos a las 16:38:48 UTC: `pgCronInstalled=false`, `cron.job` inexistente. No se inspeccionaron datos personales ni se creó extensión/scheduler.

Estos cortes nuevos no reemplazan el recibo histórico deferred de las 16:11 ni convierten sus timeouts GitHub en ausencia probada. El inventario separa metadatos configurados, estado remoto leído por coordinación y pruebas de la candidata local.


## A3 local probada — guías sin diagnóstico global, evidencia con autoría separada

Nueva asignación de coordinación después de congelar A1/U1/U2: `.github/workflows/catalog-refresh.yml`, `scripts/catalog-freshness-report.mjs`, `scripts/lib/freshness-report-cli.test.mjs`, helper `freshness-report-policy.mjs` y, mediante ampliación explícita, `g02-readiness.mjs`/test. A1 quedó integrada en `8d65c00` por coordinación; este agente no hizo commit ni tocó esas unidades.

`catalog-refresh.yml:310-332` separa pasos: guides escribe un receipt **status omitted / mode guides / reason guides-use-runner-receipt**, leyendo sólo el JSON local propio; no invoca freshness-cli ni usa las credenciales DB del step global. Priority diario mantiene conteos exactos y muestra; los modos manuales anteriores mantienen su reporte. La subida de artefactos conserva tanto receipt global/omitido como `catalog-refresh-result.json` incluso si falla el runner. Si su recibo falta o es inválido se indica unavailable, sin observaciones cero inventadas y sin modificar el original.

El CLI conserva campos/denominador/cortes anteriores, añade status/mode y autoría **window-only-not-runner-authorship**. Los conteos del productor se muestran separadamente bajo runnerEvidence y proceden de su recibo validado, sin copiar otros campos. Las tablas dicen ventana; `--require-observed` conserva salida 2 por ventana vacía y ya no afirma que el propio ciclo no persistió. `g02-readiness.mjs` excluye explícitamente status omitted o mode guides: no reutiliza denominadores/muestra legacy mezclados; mantiene días, nueve fichas y meta vigente.

**Prueba de requests local:** comandos y condiciones reales de ambos pasos de reporting del YAML ejecutados contra un transporte HTTP exclusivamente loopback, con dos tiendas y muestra fija. Guides: **0 requests globales**, recibo original idéntico y sin sample/denominator/fresh24h/byStore/observedRows fabricados. Priority: **12 requests**, ocho HEAD `count=exact`, lectura stores, ventana y dos lecturas de muestra; manual tracked conserva los mismos 12. Fixture de ventana con tres filas y recibo propio observed=1 conserva ambos valores separados. Esto demuestra trabajo evitado en la fixture, no una medición de ahorro productivo, latencia o capacidad recuperada.

Verificación A3: **14 tests aprobados** en freshness-report-cli y g02-readiness (767 ms), incluidos conteo ausente, recibo ausente/inválido, criterio de identidad legacy sin aprobación, rechazo de omitted/guides mezclado con una muestra que antes daría listo y salida 2 por ventana vacía. ESLint de los cinco MJS aprobó; sintaxis del helper, parseo YAML (11 pasos) y diff-check aprobaron. Unidad de código: 192 líneas modificadas en cinco archivos versionados + helper nuevo de 34 líneas = **226 líneas**, más esta actualización de informe. Sin nueva dependencia, SQL, cambios de datos, scraping, dispatch ni HTTP externo; los requests ejecutados fueron contra fixture local. Estado A3: local probado, **sin commit, integración ni publicación**.

Coordinación amplió evidencia agregada: variable de repositorio requested leída 16:50:32.571977 UTC clasificada enabled; no secreto. El recibo natural de catalog-refresh 37652691808 confirma includeSample=false, attempted/observed/comparable=10 y nueve missingGuideSlots; ventana observedRows=10; muestra denominator=55/fresh24h=27/fresh3h=0/identityAccepted3h=0. Fuentes raíz de lectura: `tmp/automatizaciones-codigo-2026-10-07/catalog-refresh-result.json` y `catalog-freshness.json`; no se editaron. Es un corte guides útil para continuidad, **no un ciclo diario G02 ni PC comercial completa**. Measurement 37631985891, según coordinación, guardó informes/home con verified=8, needsSetup=1 y failed=[eneba]; no se infiere quota/storage desde su failure.

**Siguiente acción:** revisión independiente de A3 con los seis archivos de código y este recibo local; conservar A1/U1/U2 congeladas. Si se integra/publica mediante autoridad separada, comprobar un guides natural con omission explícita y un priority diario con mismo denominador/muestra; no crear un dispatch para certificarlo. Las restantes propuestas conservan alcance pendiente.

Inventario final conciliado al cierre A3: **32 scripts y 46 hashes**; incluye el helper propio nuevo y `catalog-process.test.mjs` añadido simultáneamente por coordinación. Ese test ajeno sólo se inventarió/hashó, no se revisó ni ejecutó por este frente. El wrapper A2 y product-catalog tienen ediciones ajenas preservadas; los hashes del manifest corresponden al corte del árbol compartido, sin certificar esas unidades. El inventario inicial 30/44 queda registrado aparte.


Actualización de coordinación al cierre: **A2 local probado por root**, nueve tests offline con hijos reales aprobados (1783 ms), sintaxis aprobada. Sólo root modificó `scripts/run-catalog-refresh.mjs` y `scripts/lib/catalog-process.test.mjs`. Su recibo fallback cubre output ausente/vacío, conserva cualquier nonempty y no sobrescribe input de import-interest; escala SIGTERM a SIGKILL tras cinco segundos únicamente para el hijo creado, cancela timers y distingue childExit de wrappercode=1. Esta entrega no fue implementada/revisada/ejecutada por este agente; revisión independiente pendiente. El inventario preserva audit_sha256 anterior del wrapper y registra su hash candidato.

Eneba, evidencia agregada proporcionada por coordinación: run natural schedule **37653916174** sobre `99d5917`, 16:40:38–16:41:07 UTC, success; lectura DB read-only de las 16:52:49 UTC: status ready, fetchedAt/feedUpdatedAt 16:41:01 UTC, expiresAt 22:41:01 UTC. Es una recuperación del snapshot de feed en ese corte, no acreditación de compras/stock ni de todas las conexiones. La conexión measurement todavía conserva el error anterior de las 13:52 (`feed-not-current`) hasta su siguiente lectura diaria; no se declara todo recuperado ni se despacha sync.
