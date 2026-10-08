# Cadencia publicada de guías — 2026-10-08

Revisión de lectura cerrada a las 21:38 UTC. GitHub API para configuración, runs, jobs y nombres/fechas de secretos; estado público de GitHub. Sin logs, valores de secretos, dispatch, cambios de cron ni intervención en el drenaje. Las consultas son cortes independientes.

## Resultado

Hoy aparecen **cuatro runs programados: tres de guías y uno priority**. El listado de los últimos tres ocultaba el de las 01:57 UTC y el de las 11:55 UTC era priority. Todos terminaron con éxito, intento 1, sobre main `3b7107c5c0953fb9425ee982439efbb34f06ac01`.

El workflow publicado realmente configura guías cada hora al minuto 17, excepto la hora 05; priority a las 05:05 UTC. No configura intervalos de cuatro o siete horas. Los jobs de hoy comenzaron 3–5 segundos después de crear el run. La separación observada aparece antes de la creación visible del run; esta evidencia no permite distinguir retraso del disparador frente a slots descartados por GitHub.

## Configuración publicada y condiciones

- [Workflow fijo en main](https://github.com/john2k2/comparador-hardware-argentina/blob/3b7107c5c0953fb9425ee982439efbb34f06ac01/.github/workflows/catalog-refresh.yml#L41): cron líneas 44–45, concurrency 50–52, refresh 57 y resolución por expresión cron. Blob leído por API: `600d50459ccc979bb1e0fdaaa05388af4d82301a`, 15.754 bytes.
- Workflow ID `252554336`, estado `active`; repositorio público, default branch main, `archived=false`, `disabled=false`; Actions habilitado. Main recibió commit el 07/10 a las 22:55:21 UTC: no corresponde la inactividad de 60 días que desactiva schedules públicos.
- El workflow del commit `c52af9a` del 29/09 contiene las mismas expresiones cron. La candidata `268f9792a76ca047b125f48fa278cd851c6282a5` no cambia esas expresiones; sus cambios pendientes no explican los horarios de producción.
- Refresh no tiene una condición de job que descarte horas de guías. La resolución asigna `guides` al cron `17 0-4,6-23 * * *` y `priority` al cron `5 5 * * *`; rechaza una expresión desconocida.
- Concurrency `catalog-refresh`, `cancel-in-progress: false`. El timeout de refresh es 30 minutos. En esta muestra los jobs duran aproximadamente 1–10 minutos y no hay runs cancelados entre los últimos 20: no se demostró que concurrency causara estas brechas.
- Telemetría depende de refresh y exige schedule diario, intento 1 y modo priority (líneas 358–363). Los tres runs de guías la omiten; priority la ejecutó. Recuperar guías no autoriza otro mantenimiento diario.
- Se verificó sólo metadata de existencia: `CATALOG_REFRESH_CRON_SECRET`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y `SUPABASE_URL` presentes. Existencia no prueba validez; los cuatro runs observados no fallaron en la guardia de secreto ausente.

## Ejecuciones de hoy

`created_at = run_started_at` en los cuatro. El modo se contrastó con estados de steps/jobs, sin leer sus logs. Horarios UTC.

| Run | Modo | Creación | Job refresh | Telemetría |
| --- | --- | --- | --- | --- |
| [37715478240](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37715478240) | guides | 01:57:28 | 01:57:31–01:59:31 | skipped |
| [37753683394](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37753683394) | guides | 09:00:42 | 09:00:45–09:02:15 | skipped |
| [37773321495](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37773321495) | priority | 11:55:45 | 11:55:48–12:05:51 | success, 12:05:53–12:07:11 |
| [37809333365](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37809333365) | guides | 16:30:32 | 16:30:37–16:32:01 | skipped |

Los intervalos entre inicios son 7h03m14s, 2h55m03s y 4h34m47s. Priority se creó 6h50m45s después de las 05:05 del mismo día; la API consultada no aporta el timestamp nominal de origen que permita atribuir inequívocamente ese retraso a un slot concreto. Éxito del job no prueba ofertas comparables guardadas ni continuidad de su frescura.

## Últimos 20 runs del workflow

Todos: evento schedule, completed/success. Fechas UTC; este listado muestra recurrencia de la separación durante varios días, no sólo un incidente del 08/10.

| Fecha | Creación | Run ID |
| --- | --- | --- |
| 10-08 | 16:30:32 | 37809333365 |
| 10-08 | 11:55:45 | 37773321495 |
| 10-08 | 09:00:42 | 37753683394 |
| 10-08 | 01:57:28 | 37715478240 |
| 10-07 | 21:59:57 | 37693247058 |
| 10-07 | 16:31:19 | 37652691808 |
| 10-07 | 11:40:59 | 37615730041 |
| 10-07 | 08:42:08 | 37595522059 |
| 10-07 | 01:34:03 | 37557744819 |
| 10-06 | 21:39:16 | 37535395529 |
| 10-06 | 17:12:49 | 37501788736 |
| 10-06 | 11:56:21 | 37459754322 |
| 10-06 | 10:21:25 | 37449234755 |
| 10-06 | 03:00:22 | 37406896449 |
| 10-05 | 22:39:17 | 37383838464 |
| 10-05 | 16:03:00 | 37337754740 |
| 10-05 | 12:11:44 | 37307844017 |
| 10-05 | 07:05:20 | 37275775649 |
| 10-05 | 00:57:07 | 37249475836 |
| 10-04 | 21:28:51 | 37236257278 |

Fuente: [API runs del workflow](https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/catalog-refresh.yml/runs?per_page=20), y consulta adicional `created=2026-10-08&per_page=100`, total 4. Consultas del repositorio por estado queued/in_progress/waiting/pending dieron cero en cada categoría; son snapshots, no garantía de ausencia posterior.

## Explicación y siguiente acción

[GitHub documenta](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) que schedule puede demorarse por carga y que algunos jobs pueden descartarse. Sólo se ejecuta en default branch; evitar el comienzo de hora reduce una causa habitual, y este workflow ya usa el minuto 17. Esta explicación es compatible con las observaciones, pero no identifica por sí sola la causa de cada slot ausente. [Concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) tampoco garantiza conservar todos los pendientes cuando `cancel-in-progress` es false.

[GitHub Status](https://www.githubstatus.com/api/v2/status.json), consultado el 08/10 a las 21:28:21 UTC: indicador none, Actions operational; [incidentes abiertos](https://www.githubstatus.com/api/v2/incidents/unresolved.json), ninguno. No prueba ausencia de demoras anteriores o específicas de este repositorio.

Recomendación costo cero: conservar el cron publicado y, después de cerrar el drenaje, revisar la promoción separada de la candidata ya preparada que amplía el respaldo existente de Cloudflare a guías. No agregar otro cron ni ampliar la ventana comprable. En `268f979`, [CADENCIA.md](../estabilidad-2026-10-08/CADENCIA.md) líneas 3–7 describe un despacho por evento, permiso compartido de uno por hora, prioridad a guías tras 120 minutos, bloqueo por actividad/pendientes y ausencia de reintento ante POST incierto; líneas 15–19 explican carrera y competencia con adaptativo.

La candidata sigue local y sus pruebas históricas no verifican esta producción. Su publicación requiere la decisión del coordinador y la autoridad vigente. Medir 48 horas naturales de intervalos efectivos, observaciones/comparables guardadas y throughput adaptativo; conservarla sólo si recupera oportunidades útiles sin un costo inaceptable en componentes. Esta revisión no creó ni activó un workaround.
