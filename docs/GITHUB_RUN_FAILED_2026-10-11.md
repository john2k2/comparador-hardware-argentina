# Correos Run failed: diagnóstico y corrección preparada

Corte: 11/10/2026, rama local `codex/busqueda-funcional`. Los correos corresponden a ejecuciones fallidas reales de GitHub Actions. No se silenciaron las notificaciones ni se convirtió un resultado incompleto en éxito. Los cambios siguientes están preparados y probados localmente, **todavía sin activar en GitHub**.

## Dos causas verificadas

| Proceso | Evidencia | Causa y efecto |
|---|---|---|
| Actualización adaptativa | [13:12 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38142224312), [11:12 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38134686415), [09:15 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38127704480) | Inventario Katech `blocked`, código del transporte para 403. El runner declara fallo global aunque otras tiendas hayan persistido observaciones. |
| Medición privada | [Ejecución de 13:28 UTC](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38143330641) | Eneba fue el único proveedor con error: su muestra venció antes de comenzar la lectura de 13:29:23 UTC. |

Los tres recibos adaptativos acreditaron 1.189, 1.097 y 706 observaciones con ACK confirmado; 475, 475 y 282 comparables. No registraron ACK inválidos ni errores de persistencia. Eso demuestra trabajo parcial conservado, no cobertura completa ni recuperación de Katech. El reintento del inventario fallido espera una hora, por lo que las activaciones repetidas vuelven a encontrar ese bloqueo.

El [productor de Eneba](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38121032614) guardó once ofertas, muestra tomada a las 07:20:50 UTC, vencimiento 13:20:50 UTC. El colector arrancó ocho minutos y treinta y tres segundos después del vencimiento. Su cron y el del productor son independientes; GitHub no garantiza que comiencen a tiempo ni en ese orden. No se amplió la ventana de seis horas para esconder el problema.

## Cambios preparados

- El colector de medición, cuando Eneba falla y su muestra está ausente o vencida, llama una vez al productor oficial existente y repite sólo la lectura Eneba. Respeta habilitación del piloto, fecha oficial, seis horas, comprobación de persistencia y readback. Caché inválida, DB no disponible o errores de otros proveedores no se tratan como ausencia. Si no recupera una fuente válida, mantiene exit 1.
- El resumen del adaptativo muestra la tienda fallida, conteos y ACK confirmados, con campos permitidos y sin mensajes del SDK, URLs privadas o credenciales. Conserva exit 1 ante el mismo fallo real.
- Inventario Katech pide sólo `id,name,permalink`: la primera página se redujo de 250.939 a 17.004 bytes. La API sigue excluida como prueba de precio y stock; esos datos necesitan la publicación visible.

Katech respondió HTTP 200 desde la Mac usando tanto los campos anteriores como los mínimos. Primera y última página informaron 3.956 registros y 40 páginas coherentes. Sólo se leyeron esas páginas, no las 38 intermedias; no se afirma cobertura completa. Dos detalles verificaron identidad textual, canonical y SKU, pero declararon `available-on-backorder`, aunque mostraban “Disponible en 24/48hs”. No se acreditaron como comprables ni se guardaron en ninguna base.

**El 403 desde GitHub sigue pendiente de una prueba desde ese origen.** Menos transferencia es una mejora comprobada; no demuestra que desaparezca el bloqueo. No se añadieron proxies, rutas para evadir WAF ni un fallback que convierta el bloqueo en catálogo vacío.

## Verificación y activación pendiente

El coordinador repitió 18 pruebas de recuperación/resumen y 35 de inventario/discovery/lotes Woo: todas aprobadas, tanto con Node 26 de la Mac como con Node 22.16 del mismo major del runner. Typecheck y lint de los archivos modificados aprobados. El implementador comprobó también 19 pruebas de supervisor/artefactos, quince del productor/servicio de medición y compiló la entrada real del colector sin ejecutarla. La revisión independiente no encontró P1/P2 reproducibles. No hubo renovaciones reales de Eneba ni escrituras Supabase en esta validación.

La Mac informó sólo 309 MiB libres durante la comprobación; descargar el paquete completo de Node 22 falló por falta de espacio. Se verificó usando temporalmente sólo el binario oficial con checksum, y se retiró después de las pruebas. No se borraron archivos del usuario. El disco casi lleno es un límite real para operar el catálogo local, independiente de estos fallos de GitHub; no se atribuyen las demoras de red a esa condición sin evidencia.

Publicar en `main` activa Workers Builds y despliega la web. Se confirmó en el panel: rama `main`, compilaciones habilitadas, rutas incluidas `*`, comando de despliegue `npx wrangler deploy`. Esa publicación no se hizo para respetar la instrucción de conservar la página. La API OAuth disponible no tiene acceso a la configuración de Builds (403); el panel sí muestra el control `Disable builds`.

Procedimiento concreto para activar solamente estas correcciones: registrar versión actual, pausar temporalmente Builds en el panel, publicar un parche aislado de los archivos de GitHub/medición/inventario basado en el `main` remoto vigente, ejecutar/verificar la medición y la lectura de Katech desde Actions con recibos, comprobar que la versión pública sigue igual y restaurar Builds. No incluir los scripts ni los datos del piloto D1. No llamar solucionados los correos hasta confirmar la ejecución real; si Katech mantiene 403, conservar la incidencia y gestionar una fuente permitida o el inventario desde la Mac con transporte propio.

Evidencia local: `outputs/github-failed-runs-2026-10-11/`, artefactos de los tres runs adaptativos, recibo anterior Eneba, `recovery-tests.txt`, `source-tests.txt`, `typecheck.txt`, `lint.txt`, y captura `builds-antes.png`. Esos outputs no se agregan a Git.
