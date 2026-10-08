# Recuperación de guías en el programador existente

El cron de respaldo de Cloudflare, al minuto 11, ahora puede recuperar guías además del adaptativo. Lee los diez últimos runs de ambos workflows de main, valida toda la respuesta y bloquea el despacho si cualquiera está activo o pendiente. Un inicio manual, fallido o de re-run también conserva la espera de 75 minutos.

Entre destinos elegibles da prioridad a guías cuando pasan 120 minutos desde su último inicio. En el resto elige el más atrasado, con empate a favor de guías. Después de una espera relee ambos workflows y vuelve a elegir. Mantiene un solo despacho por evento, el mismo permiso distribuido de uno por hora, 60 segundos de presupuesto, ocho segundos por request y una espera de hasta diez segundos. Un POST fallido o de resultado incierto no se repite.

El despacho de guías utiliza únicamente `mode=guides`. El nombre del run y su artefacto identifican `cloudflare-fallback`, `github-schedule` o `manual`; esa etiqueta es evidencia declarada, no autenticación. Guías fallback no cuenta como diario G02 ni habilita el retiro de telemetría. No se agregaron cron, permisos de retiro, tareas de scraping público ni una nueva automatización de Codex.

## Verificación y límites

- `npx vitest run src/lib/catalog/scheduler.test.ts`: 81 pruebas aprobadas. Incluyen simulación de 48 ticks con 24 envíos por destino, fase adversa con guías a 125 minutos frente a adaptativo de 180, cruce del umbral durante la espera, estados/fechas inválidos, permiso concurrente y respuesta POST perdida.
- `node --test scripts/lib/refresh-entry.test.mjs scripts/lib/telemetry-maintenance-workflow.test.mjs`: 13 controles aprobados. Comprueban origen conservado en éxito/fallo y exclusión del respaldo de guías del retiro diario.
- Lint, tipos, verificación general, build OpenNext y Wrangler sin publicación aprobados. Revisión independiente Sol/high cerrada sin hallazgos materiales abiertos para este comportamiento.

La oportunidad antes de tres horas depende de que haya ticks, capacidad de GitHub y datos comprables al ejecutar. Un run iniciado no acredita una observación fresca. GitHub puede crear un run nativo entre el listado y el POST: la concurrencia existente mitiga la ejecución simultánea, pero esas operaciones no son una transacción y un pendiente puede reemplazar otro.

Guías y adaptativo compiten por el mismo permiso. Como escenario, las ocho ejecuciones nativas y 21 fallback adaptativas observadas en 48 horas equivalen a 14,5 por día. Partir esos fallback en dos, con las mismas cuatro nativas por día, daría 9,25 adaptativas por día, aproximadamente 36% menos. No es una predicción: el estado real decide cada despacho.

Durante 48 horas naturales después de publicar se debe medir intervalo efectivo de guías, observaciones/comparables guardadas y throughput adaptativo. Mantenerlo si recupera slots útiles sin una pérdida inaceptable en componentes. Reconsiderar la distribución si no mejora ofertas: no ampliar la elegibilidad de tres horas ni declarar recuperado el 22% general.

## Unidad y reversión

Archivos: scheduler y su prueba, workflow de catálogo, entrada del runner, dos pruebas operativas y este documento. Volver al selector adaptativo anterior conserva el cron y el permiso actuales; retirar la etiqueta adicional puede hacerse después sin cambiar las guías editoriales ni el mantenimiento diario.

La unidad de scheduler conserva pruebas necesarias aunque su diff cohesivo supera 400 líneas añadidas/eliminadas. Se registra la excepción de tamaño para revisión; no se borraron pruebas ni se comprimió código para encajar. No se abrió un PR acumulado.

Fuente primaria: [limitaciones del schedule de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Los cron pueden demorarse o descartarse; el respaldo reduce una dependencia, no promete puntualidad.
