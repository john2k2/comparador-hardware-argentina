# Integración dentro de la programación existente

Preparación local. No se creó workflow, cron ni heartbeat nuevo; horarios y concurrencia se conservan. El job separado depende del resultado de resolución del refresh: sólo cron diario priority, sin ejecutar en guides ni manuales. Un fallo de mantenimiento conserva su recibo y hace fallar su job; el artefacto de frescura de catálogo permanece separado para no atribuir un retiro de eventos a revisión de ofertas.

Default inspect: sólo GET de hasta 250 metadatos vencidos, sin RPC de retiro ni archivos nuevos en Storage. Cambiar a archive-retire exige publicar la candidata, instalar exclusivamente la migración revisada y configurar modo/approval ID bajo autorización específica. Las credenciales server del repositorio ya existen; el Worker no recibe este trabajo. Cuatro lotes de 250, 120 s, 5 MiB/run y tope interno de contenedor 50 MiB; lo último requiere la RPC local preparada. Ningún límite acredita throughput real o ahorro físico.

Los tres objetos de cada lote quedan privados; selección y payloads no son artefactos públicos. Sólo se conserva telemetry-maintenance.json, agregado con hashes, durante 30 días. Para recuperar después, usar el hash custodiado de manifiesto y los tres objetos del contenedor. No se elimina el respaldo al llenarse.

Una respuesta mutante desconocida detiene ese run; no es una pausa persistente de futuros cron. Operación debe inspeccionar el recibo y pasar modo a inspect antes de otra ejecución, reconciliar ese lote y decidir el siguiente paso. Ante fallo, no repetir manualmente archive-retire con el mismo lote para “hacerlo verde”.

Pruebas: node --test scripts/lib/telemetry-maintenance-workflow.test.mjs, 2/2 controles del contrato; node --test scripts/lib/telemetry-maintenance-cli.test.mjs, 10/10 controles del CLI, incluido transporte simulado completo de cuatro lotes y custodia privada. YAML parseado, condición/args/rutas/artefacto comprobados. No se ejecutó GitHub Actions ni se modificaron variables/secretos. Rollback: quitar este job y su output, conservar workflow original; modo inspect deshabilita mutación y las funciones pueden permanecer sin llamada.
