# Correos Run failed: diagnóstico y corrección activada

Corte: 11/10/2026, rama local `codex/busqueda-funcional`. Los correos corresponden a ejecuciones fallidas reales de GitHub Actions. No se silenciaron las notificaciones ni se convirtió un resultado incompleto en éxito. El usuario autorizó activar el parche preservando la página. Se publicó únicamente el commit `d1081e196f2818a96f5b6d01794ebc1e385b859a`, basado en `main` remoto; los archivos y datos del piloto D1 quedaron fuera.

## Dos causas verificadas

| Proceso | Evidencia | Causa y efecto |
|---|---|---|
| Actualización adaptativa | [13:12 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38142224312), [11:12 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38134686415), [09:15 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38127704480) | Inventario Katech `blocked`, código del transporte para 403. El runner declara fallo global aunque otras tiendas hayan persistido observaciones. |
| Medición privada | [Ejecución de 13:28 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38143330641) | Eneba fue el único proveedor con error: su muestra venció antes de comenzar la lectura de 13:29:23 UTC. |

Los tres recibos adaptativos acreditaron 1.189, 1.097 y 706 observaciones con ACK confirmado; 475, 475 y 282 comparables. No registraron ACK inválidos ni errores de persistencia. Eso demuestra trabajo parcial conservado, no cobertura completa ni recuperación de Katech. El reintento del inventario fallido espera una hora, por lo que las activaciones repetidas vuelven a encontrar ese bloqueo.

El [productor de Eneba](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38121032614) guardó once ofertas, muestra tomada a las 07:20:50 UTC, vencimiento 13:20:50 UTC. El colector arrancó ocho minutos y treinta y tres segundos después del vencimiento. Su cron y el del productor son independientes; GitHub no garantiza que comiencen a tiempo ni en ese orden. No se amplió la ventana de seis horas para esconder el problema.

## Cambios activados

- El colector de medición, cuando Eneba falla y su muestra está ausente o vencida, llama una vez al productor oficial existente y repite sólo la lectura Eneba. Respeta habilitación del piloto, fecha oficial, seis horas, comprobación de persistencia y readback. Caché inválida, DB no disponible o errores de otros proveedores no se tratan como ausencia. Si no recupera una fuente válida, mantiene exit 1.
- El resumen del adaptativo muestra la tienda fallida, conteos y ACK confirmados, con campos permitidos y sin mensajes del SDK, URLs privadas o credenciales. Conserva exit 1 ante el mismo fallo real.
- Inventario Katech pide sólo `id,name,permalink`: la primera página se redujo de 250.939 a 17.004 bytes. La API sigue excluida como prueba de precio y stock; esos datos necesitan la publicación visible.

Katech respondió HTTP 200 desde la Mac usando tanto los campos anteriores como los mínimos. Primera y última página informaron 3.956 registros y 40 páginas coherentes. Sólo se leyeron esas páginas, no las 38 intermedias; no se afirma cobertura completa. Dos detalles verificaron identidad textual, canonical y SKU, pero declararon `available-on-backorder`, aunque mostraban “Disponible en 24/48hs”. No se acreditaron como comprables ni se guardaron en ninguna base.

**El 403 desde GitHub persistió en la prueba de activación 38146238481.** Menos transferencia es una mejora comprobada; no eliminó el bloqueo. No se añadieron proxies, rutas para evadir WAF ni un fallback que convierta el bloqueo en catálogo vacío.

## Verificación local y activación

El coordinador repitió 18 pruebas de recuperación/resumen y 35 de inventario/discovery/lotes Woo: todas aprobadas, tanto con Node 26 de la Mac como con Node 22.16 del mismo major del runner. Typecheck y lint de los archivos modificados aprobados. El implementador comprobó también 19 pruebas de supervisor/artefactos, quince del productor/servicio de medición y compiló la entrada real del colector sin ejecutarla. La revisión independiente no encontró P1/P2 reproducibles. No hubo renovaciones reales de Eneba ni escrituras Supabase durante esas pruebas locales. La activación posterior sí ejecutó el productor oficial con los permisos ya existentes de GitHub.

La Mac informó sólo 309 MiB libres durante la comprobación; descargar el paquete completo de Node 22 falló por falta de espacio. Se verificó usando temporalmente sólo el binario oficial con checksum, y se retiró después de las pruebas. No se borraron archivos del usuario. El disco casi lleno es un límite real para operar el catálogo local, independiente de estos fallos de GitHub; no se atribuyen las demoras de red a esa condición sin evidencia.

### Recibos de activación del 11/10/2026

Se pausó y guardó temporalmente Workers Builds, se publicó sólo el parche aislado y se restauró la configuración original a las 14:09 UTC. El panel confirmó `Disable builds=false` y ausencia de cambios sin guardar. La rama de producción sigue siendo `main`; ninguna opción restante se modificó.

- [Verificación completa 38145726656](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38145726656): éxito, 2.573 pruebas unitarias aprobadas (dos omitidas), 223 pruebas de runners aprobadas (dos omitidas) y regresiones SQL aprobadas, 106 pruebas de navegador aprobadas. Las pruebas SQL se ejecutaron contra PostgreSQL aislado, sin migrar producción.
- [Medición Eneba 38145734853](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38145734853): éxito. El recibo de 14:05:33 UTC declara `enebaRecovery=refreshed`, `verified=1`, `failed=[]`, `persisted=true` y `publicHomePersisted=true`. Se comprobó la recuperación real y la persistencia, no sólo el estado verde del workflow.
- La versión pública antes y durante la activación conserva deployment `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100%, con modificación 10/10/2026 22:55:51 UTC. La lectura posterior a restaurar Builds, 14:10:09 UTC, confirmó también ETag y deployment idénticos (`productionUnchanged=true`).
- [Prueba adaptativa acotada 38146238481](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38146238481): fallo real. Se solicitó `max_offers=1`, inició 14:12:50 UTC, después del plazo de una hora. Katech volvió a declarar inventario `failed/blocked` a las 14:12:52 UTC; las demás fuentes de inventario estaban diferidas. La única oferta intentada de FullH4rd también devolvió `blocked`. Cero observaciones y cero comparables; no hubo errores de ACK. El paso nuevo de diagnóstico se ejecutó correctamente y expuso el bloqueo, conservando exit 1. No se amplió la prueba ni se atribuyó cobertura al resultado.

### Límite restante y prioridad

Eneba quedó recuperado en una ejecución real, pero **no se eliminaron todos los correos de fallo**: el inventario Katech continúa bloqueado desde GitHub. No se silenció el aviso ni se convirtió el inventario fallido en vacío. La siguiente prioridad es probar la adquisición desde la Mac y el transporte incremental al piloto Cloudflare, o usar una fuente expresamente permitida, con observaciones y recepción demostrables antes de cambiar el sitio. No se activó ese transporte local ni se programaron consultas nuevas en esta publicación.

Evidencia local: `outputs/github-failed-runs-2026-10-11/`, artefactos de los tres runs adaptativos, recibo anterior Eneba, `recovery-tests.txt`, `source-tests.txt`, `typecheck.txt`, `lint.txt`, recibos/logs de activación, comparaciones de deployment y capturas `builds-antes.png`, `builds-pausados.png` y `builds-restaurados.png`. Esos outputs no se agregan a Git.
