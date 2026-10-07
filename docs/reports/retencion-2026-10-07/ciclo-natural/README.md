# Ciclo natural: despacho observado, resultado pendiente

Fuente publicada: `99d5917b5ec185314d8ae081beb971894709ebcd`, Worker `652e3c18-4182-43d1-9d98-5f10afd67aa8`, activo desde **07/10 14:53:32 UTC / 11:53:32 Santiago**. No se despachó refresh manual desde esta tarea.

## Corte de las 12:31 Santiago

[runs-1531.json](runs-1531.json) conserva los últimos diez runs de `catalog-adaptive-refresh.yml` obtenidos de GitHub. El último sigue siendo **37626593331**, creado 13:11:43 UTC sobre `2dc40b8`, anterior a la publicación. Su resultado observado, 1.299 intentos, 653 observaciones y 295 comparables, pertenece a esa versión previa; workflow success y salida por deadline no acreditan recuperación de `99d5917` ni G02.

[scheduler-gate.json](scheduler-gate.json) es una lectura agregada del único bucket fijo `catalog-scheduler-dispatch-hour`: `count=1`, `updated_at=15:11:32.516526 UTC`, `window_end=16:11:32.516526 UTC`; lectura 15:25:49 UTC. Demuestra que el control de despacho fue alcanzado, no que GitHub haya aceptado el POST ni cuál fue su respuesta. No se invocó el RPC mutante del control.

El fallback de Cloudflare tiene cron al minuto 11 y GitHub programa el adaptativo al minuto 41. El siguiente horario nominal posterior a este corte es **15:41 UTC / 12:41 Santiago**. Los horarios programados no garantizan el momento de ejecución. No atribuir la ausencia de un run a una causa todavía no observada.

**Corte final 15:41:02 UTC / 12:41:02 Santiago:** [runs-final.json](runs-final.json) sigue mostrando 37626593331 como último run; no hay uno sobre `99d5917` en los últimos diez. Es el comienzo del minuto nominal y GitHub puede diferir el cron; este corte no prueba que haya fallado el horario de las 12:41. [main.json](main.json), leído 15:38:49 UTC, confirma que main sigue en la fuente publicada. El ciclo nuevo continúa pendiente.

## Límite de diagnóstico

Una consulta de claves de telemetría histórica, intervalo 15:10–15:13 UTC y filtro del servicio, fue rechazada por Cloudflare con HTTP 403 / código 10000. [observability-keys.json](observability-keys.json) guarda sólo ese resultado sanitizado. La credencial CLI existente no permite esa lectura; no se cambiaron permisos, secretos o configuración ni se creó una consulta persistente. No se obtuvo un log de error del despacho.

La sesión del navegador disponible muestra el formulario de login de Cloudflare; no se inició sesión ni se pidieron credenciales. [workflow.json](workflow.json) conserva el estado del workflow leído en GitHub, sin modificarlo.

La próxima comprobación debe correlacionar un run natural nuevo con SHA, artefacto y observaciones guardadas/comparables. Si no aparece, investigar el despacho con el resultado exacto, sin suplirlo mediante un refresh manual que ocultaría el problema. La restricción de lectura histórica conserva esa causa como pendiente; no prueba un fallo de la RPC de catálogo.
