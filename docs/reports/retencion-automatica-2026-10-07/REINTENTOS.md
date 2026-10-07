# Retiro diario sin repetición del mismo evento

En la activación de la fuente 737825b, el filtro schedule/priority excluía workflow_dispatch y guías, pero no un re-run del diario original. GitHub conserva el evento al repetir una ejecución y aumenta github.run_attempt. Una repetición podía seleccionar otro lote y retirar hasta 1.000 adicionales; no respetaba el criterio de primer ciclo natural ni el procedimiento de conciliar una respuesta perdida.

Corrección acotada: exigir primer intento ('1') y cron exacto de las 05:05 UTC además de schedule y priority. No cambia horarios, cuotas, SQL ni límites del núcleo. Mantener inspect durante la publicación y restaurar archive-retire tras CI y revisión. No ejecutar un re-run mutante en producción para probarlo.

Verificación: node --test scripts/lib/telemetry-maintenance-workflow.test.mjs; tres casos de prueba, incluida matriz de siete escenarios tomada de la expresión real del YAML. Diario primer intento permitido; intentos 2/3, workflow_dispatch, guías y cron ajeno bloqueados. La prueba interpreta únicamente igualdad de strings y conjunción usadas por esta guardia; no simula todo GitHub. El primer diario real queda pendiente.

Referencia oficial: [github.run_attempt](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts), [re-ejecución de workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs). No es un registro global de presupuesto por fecha ni deduplica otros run IDs; cada ciclo natural continúa con máximo de 1.000 y concurrencia serializada.

Rollback: mantener inspect para detener mutaciones. Revertir esta guardia conserva cron y resto del workflow, pero vuelve a habilitar re-runs; no restaurar archive-retire con esa reversión sin una decisión específica sobre repetición. No hay datos que recuperar por esta corrección: no retiró eventos ni subió archivos.
