# Automatizaciones, scripts y optimización — 07/10/2026

Se revisaron los **30 archivos iniciales de scripts, seis workflows, 21 comandos npm**, el cron de Cloudflare y el único heartbeat local del Comparador. Se contrastó configuración con ejecuciones de GitHub, artefactos y metadatos DB de lectura. La candidata incorpora dos archivos de scripts nuevos: **32 en el inventario final**, con 46 hashes conciliados. No se certifican todas las cuentas externas, schedulers de otros usuarios o cada combinación de hardware.

## Resultado local

Copia `/Users/johnortiz/.codex/worktrees/comparador-confianza/comparador-hardware-argentina`, rama `codex/optimizacion-automatizaciones`, base `638d6da`. Contiene las preparaciones locales anteriores; su publicación no se presupone. Código público de referencia: `99d5917`, observado en los runs citados. Estas seis unidades están integradas localmente, revisadas de forma independiente y probadas:

| Unidad / commit | Problema y cambio | Evidencia y límite |
|---|---|---|
| U1 `c68d84d` | Limpieza podía borrar una caché renovada entre SELECT y DELETE. Exige misma expiración y vencimiento al corte. | Renovación concurrente conservada; no es purga global ni ahorro de cuota. |
| U2 `181cfc9` | ACK con error resuelto se ignoraba. Caché y telemetría comprueban error/rechazo y registran sólo scope controlado/SQLSTATE válido. | Best effort conservado; telemetría rechaza error fijo. Background no garantiza entrega al terminar Worker. |
| A1 `8d65c00` | Cron llega segundos antes de vencer su guarda. Una espera ≤10 s, relectura GitHub y misma RPC. | 60 s de presupuesto, request ≤8 s; 75 min y 1/h conservados. Nunca liberar/repetir dispatch ambiguo. |
| U3 `b195d2f` | Dedupe leía toda la fila de ofertas. Proyección de seis campos usados. | Precio/revisión/fecha/poda equivalentes; bytes, CPU y latencia no medidos. |
| A2 `761d596` | Hijo cortado podía dejar el job sin JSON. Supervisor SIGTERM→SIGKILL y recibo atómico ante output ausente/vacío. | Nueve tests con hijos reales offline. Conserva resultado no vacío; SIGKILL del padre sigue fuera del contrato. |
| A3 `c69e624` | Guías horarias repetían diagnóstico global. Guías guardan omisión explícita y recibo propio; priority diario conserva conteos/muestra. | Fixture dos tiendas: guides0requests vs priority12/8exact counts. G02 rechaza guías/omisión, sin fabricar ceros o días útiles. |

[Cambios, pruebas y reversión por unidad](cambios.md), [inventario de scripts](inventario-scripts.json), [análisis de automatizaciones](automatizaciones.md) y [análisis de persistencia/performance](optimizaciones.md). Unidades de código con tests/docs acotadas por debajo de 400 líneas autorales; inventarios y recibos generados se registran aparte.

## Verificación final

`npm run verify` terminó exit0: lint, TypeScript, **1922 unitarias aprobadas, dos omitidas preexistentes**, y **41 pruebas de scripts aprobadas**. OpenNext compiló correctamente y generó worker/53 páginas estáticas con live scraping y refresh interno deshabilitados y claves privilegiadas vacías. No hubo publicación, refresh manual ni operación remota mutante durante esta revisión. Los warnings de middleware y runtime Node son preexistentes; el build aprobado no mide CPU o disponibilidad productiva.

La [revisión independiente](revision-independiente.md) no encontró hallazgos materiales en las seis unidades. También comparó el monitor original con la candidata; se corrigieron cinco omisiones de contrato detectadas, sin actualizar la automatización activa. [Recibo de verificación](evidencia/verificacion.json) contiene hashes de logs locales, conteos y límites. No se repitieron recorridos generales de navegador: no hay cambio visual o de contrato público; las regresiones de persistencia/transporte son deterministas. SQL/migraciones no se modificaron.

## Lo contrastado en operación

- **GitHub:** seis workflows active al corte 16:38:48 UTC. La variable de requested está enabled, comprobada 16:50:32 UTC. Configuración activa no prueba frecuencia efectiva o trabajo útil. [Metadatos y runs](evidencia/github-runs.json).
- **DB:** lectura READ ONLY con límite3s, 16:38:48 UTC: pg_cron no instalado, cron.job y cron.job_run_details ausentes. No hay ese scheduler adicional dentro de esta DB. [Metadatos](evidencia/db-scheduler-metadata.json).
- **Mac:** sin crontab del usuario ni LaunchAgent relacionado en la carpeta del usuario, 17:01:20 UTC. No se inspeccionaron otros usuarios o schedulers de todo el sistema. [Corte](evidencia/local-scheduler-metadata.json).
- **Guías:** run schedule [37652691808](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37652691808), código `99d5917`, 16:31:19–16:32:52 UTC: **10 intentos, 10 observaciones guardadas, 10 comparables, nueve slots pendientes**, sin deadline/truncamiento y includeSample=false. [Resultado propio](evidencia/catalog-refresh-result.json). Es un ciclo natural de guías de la publicación de referencia; **no acredita ciclo diario útil G02 ni PC comercial completa**.
- **Cobertura:** reporte separado 16:32:29 UTC: global52061 ofertas disponibles,4434≤24h y10≤3h. Muestra fija55 disponibles,27≤24h,0≤3h y0identidad aceptada reciente. Los diez cambios de ventana no se usan como prueba de autoría; el runner tiene su recibo separado. [Frescura](evidencia/catalog-freshness.json). No se satisface el95% ni las nueve fichas recientes.
- **Medición:** run [37631985891](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37631985891), código anterior `2dc40b8`: ocho proveedores verificados, uno requiere setup, Eneba falló, pero las lecturas y home se guardaron. No hubo excepción de guardado: el script devuelve exit1 ante proveedor error. [Salida saneada](evidencia/measurement-failure-cause-sanitized.json).
- **Eneba:** la conexión conservaba error feed-not-current de13:52; una actualización schedule posterior [37653916174](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37653916174), código `99d5917`, terminó16:41:07. DB a16:52:49 confirmó snapshot ready, feed16:41:01 y vencimiento22:41:01. [Metadatos](evidencia/eneba-cache-measurement-state.json). Recuperación del feed al corte; la conexión de medición necesita su siguiente lectura, sin refresh desde este chat.

## Monitor diario existente

Un solo heartbeat `seguimiento-comparador-hardware`, ACTIVE, diario10:00local. Prompt48170 caracteres con historial hasta02/10. La [propuesta compacta](monitor-propuesta.md) conserva horarios/destino/estado, silencio, pestañas propias, G02, guías, privacidad, fechas, permisos sociales y única excepción de interés anónimo. El texto candidato final mide9585 caracteres; no se infiere factura de tokens de estos tamaños. La configuración activa no fue editada ni se creó otro monitor. La candidata se vuelve a medir en integridad final.

## Recomendación de dirección

El problema combina **límites reales de los servicios, generación/consultas innecesarias y falta de continuidad/cobertura**. Pagar un plan no arreglaría identidad, los slots de guías ni los ACK ignorados. Tampoco unos fixes de código bajan automáticamente el tamaño físico. El corte de capacidad reutilizado registra929205395 bytes y permanece sin una reducción segura demostrada hasta500MB; DELETE, TTL y tests verdes no equivalen a recuperación física.

Siguientes tres entregas, en orden:

1. **Llevar esta candidata revisable a publicación autorizada y comprobar eventos naturales:** guides con omitted, priority con muestra/denominador conservados y scheduler con guarda/relectura. Un dispatch aceptado no es un refresh completo; no fabricar la prueba con manual ni cerrar G02 por un success.
2. **Recuperar ofertas útiles de ambos recorridos:** partir de los nueve slots pendientes y la matriz por fuente, conservar identidad/stock/frescura y muestra95%. Demostrar siete piezas comprables/compatibles antes de llamar completa a una PC. Posponer categorías/fuentes nuevas y monetización ampliada.
3. **Diseñar almacenamiento sostenible con costo cero:** limitar generación y definir retención preservada por contrato; usar la preparación aislada de historial y ambas experiencias como control. No repetir el piloto agotado de1000 ni retirar índices por cero scans. Cualquier recorte de catálogo debe declarar cobertura perdida antes de decidirlo; no achicar denominador para aparentar recuperación.

Después: coalescer lecturas DB idénticas dentro de cada proceso con clave completa y bypass separado; medir atrasos de requested/guías antes de separar su exclusión; reparar el comando manual cache:warm roto con una entrada compilada segura. Batching de telemetría queda detrás de un contrato de flush/conservación de eventos. No aplicar cambios de concurrencia o perder evidencia como atajo de rendimiento.

Grafo utilizado sólo como orientación:1987 nodos de primary histórico, presupuesto de salida1600, sin reconstrucción/LLM de graphify. Se contrastaron relaciones con la copia actual; no se presenta como auditoría vigente por sí mismo. Las conclusiones tienen archivos, pruebas o recibos, no únicamente una explicación del grafo.
