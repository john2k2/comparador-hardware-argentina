# Retención diaria publicada y habilitada

**Jonathan autorizó con «si» publicar la candidata, instalar sus dos funciones y activar el mantenimiento diario acotado. La configuración está habilitada; el primer ciclo natural todavía no ocurrió.** Candidata `737825b98306800c616fe733fda3488c14f67ea8`, enviada por fast-forward desde `614caa1`; fuente final `3b7107c5c0953fb9425ee982439efbb34f06ac01` agrega la guardia de primer intento y cron exacto. La fuente de la aplicación, paquetes y configuración del Worker permanecen iguales; se publicaron los scripts/contratos revisados y sus dependencias locales anteriores. No atribuir esta activación a una mejora medida de cobertura o tamaño físico.

## Evidencia de publicación y activación

| Control | Resultado |
|---|---|
| GitHub Verify final | [37699195605](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37699195605), fuente exacta 3b7107c, success a las 22:59:34 UTC; 1.985 unitarias y dos skips previos, 134 operativas, replay SQL, dos pruebas de concurrencia y 66 recorridos aislados. Los siete grupos nuevos SQL se probaron en la preparación aislada, no como otra suite de esta CI |
| Workers Builds final | Success para 3b7107c; Worker `9a5e47f0-5ae1-491c-990b-46428d3b0508` al 100%, deployment `555f6885-916f-49fc-b1f0-2a1a5ca47c33` desde 22:57:58 UTC |
| SQL instalado | Únicamente selector y retiro revisados; hashes exactos de ambos cuerpos, SECURITY INVOKER, search_path pg_catalog, lock timeout 500 ms |
| Permisos reales | EXECUTE de PUBLIC/anon/authenticated false y service_role true. Selector server HTTP 200, seis campos y microsegundos; ambos RPC anónimos HTTP 401/42501 con inputs vacíos que no podían retirar datos |
| Configuración | Workflow existente active, modo archive-retire restaurado y leído de vuelta a las 23:02:06 UTC, después de CI/Workers finales; approval ID conserva la candidata autorizada |
| Sitio público | 32/32 comprobaciones de la publicación inicial 737825b a las 22:43:28 UTC, cero fallos/sin fixtures; cuatro GET de home, búsqueda, comparador y acceso admin sobre la versión final 3b7107c también aprobados. No certificación de stock, siete piezas comprables ni nueva revisión visual |
| Revisión independiente | Comparador reviewer Sol/high, cero hallazgos materiales abiertos en la corrección y recibos finales; ejecutó personalmente 3/3 focales, sin editar ni operar cuentas. La revisión inicial no detectó el defecto de re-run que corrigió el coordinador |

La migración remota se registró como `20261007223609`, nombre `backed_telemetry_retention`. El archivo preparado y publicado es `20261007215027_backed_telemetry_retention.sql`; SHA-256 `1b8472a31cfc4f768c4c84793639749af9f9c43d2a235edcf76663c22ab0f970`. El tool asigna su versión al aplicar: el registro por nombre y los hashes de ambos cuerpos documentan la correspondencia. No ejecutar un db push general para “resolver pendientes”; otras migraciones locales de índices/historial conservan sus límites específicos.

Los asesores de seguridad mantuvieron diez avisos anteriores, sin nuevos: ocho INFO de RLS sin políticas y dos WARN ([extensión en public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). No se modificó su configuración en esta entrega ni se declara cerrada una auditoría general de seguridad.

## Operación habilitada

Sólo primer intento del cron natural diario priority de las **05:05 UTC**; las guías horarias, workflow_dispatch y re-runs excluyen este job en la fuente corregida. Próximo horario nominal: **08/10/2026 05:05 UTC, 02:05 America/Santiago**. GitHub puede demorar el evento; no se despachó una ejecución manual de catálogo ni de retiro para anticiparlo.

La revisión de activación detectó que schedule/priority solo no excluía un re-run del evento original. Se pasó temporalmente a inspect y se publicó [la corrección de 42 líneas](../REINTENTOS.md), con tres pruebas/matriz de siete contextos y revisión independiente. La guardia protege nuevos eventos con esa fuente; no modifica retroactivamente workflows anteriores ni deduplica otros run IDs. En los últimos treinta runs consultados no hubo ninguno de catálogo en la fuente intermedia 737825b. El modo mutante se restauró después de validar la corrección; no se ejecutó un retiro de prueba.

Máximo cuatro lotes de 250, 1.000 eventos vencidos por ejecución diaria, 120 s, 5 MiB nuevos/run y tope interno de contenedor 50 MiB con reserva de 3 MiB por selección. Respaldo y descarga exacta de tres objetos privados preceden a cada retiro; comparación de seis campos conserva cambios/ausentes, un intento y conciliación GET independiente. El artefacto público sólo contiene agregado y hashes durante 30 días; no se elimina el respaldo al llenarse.

Una respuesta incierta detiene ese run y exige pasar el modo a inspect antes del diario siguiente, descargar el respaldo y conciliar; no reintentar el lote ni restaurar producción sin decisión específica. Esta publicación no agrega pausa persistente automática.

## Próximo criterio de cierre

1. Prioridad del seguimiento existente: localizar el primer evento schedule diario y leer resultado/artefacto de telemetry-maintenance. Un cron configurado o un workflow verde no prueban por sí mismos el retiro.
2. Contrastar seleccionados, archivados, retirados reconocidos, cambiados/ausentes e inciertos; comprobar topes y hashes del respaldo privado descargable. Ante unknown/fallo, poner inspect y preservar evidencia para conciliar.
3. Después medir continuidad y capacidad, y preparar drenaje respaldado por etapas y estudio del catálogo activo. No ampliar el máximo ni retirar historial/índices por el tamaño del atraso.

Lectura posterior de 22:43:22 UTC: **931.589.267 B de base**, caché 245.489.664 e historial 176.963.584. Contenedor privado intacto: 21 objetos/102.016 B, todos con tamaño conocido. Esta activación no subió archivos ni ejecutó retiro server; el selector de prueba fue de sólo lectura. Capacidad física, éxito/throughput del primer ciclo y G02 siguen abiertos. [Recibo agregado](verificacion.json), [preparación y estudio](../README.md).

Reversión operativa: poner TELEMETRY_RETENTION_MODE en inspect detiene mutaciones futuras; quitar el job conserva ambos horarios originales. Revertir funciones/Worker no restaura datos: los eventos eventualmente retirados requieren el archivo privado y recuperación específica que preserve cambios posteriores. Versión previa del Worker `b9a4905d-67b0-4ae2-b6ee-1b18977be2a1` y fuente previa `614caa1` quedan identificadas.
