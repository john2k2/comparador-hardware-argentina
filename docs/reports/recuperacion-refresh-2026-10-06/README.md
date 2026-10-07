# Segunda entrega: diagnóstico de refresh y protección de RAM

**Estado: cambios locales; publicación y recuperación real pendientes. D02 continúa abierta.** Jonathan aplazó Versus el 06/10 y pidió continuar el plan de confiabilidad. Comparar componentes y armar una PC conservan igual prioridad y comparten estas reglas de identidad/observación.

Rama `codex/recuperacion-refresh`, desde la primera candidata `5a1990b`. Se reutiliza la worktree `/Users/johnortiz/.codex/worktrees/comparador-confianza/comparador-hardware-argentina`; `codex/confianza-precios-identidad` conserva esa primera entrega. Referencia remota consultada: `origin/main` `f899ced036eccc785915f0e6635a0fa4fc7920cc`. La copia principal y otros trabajos mantienen sus cambios.

## Dos incidentes diferentes

| Incidente del 06/10 UTC | Hecho confirmado | Límite |
|---|---|---|
| Adaptativo, run [37428162455](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37428162455) | Falló a las 07:28:09 con `REFRESH_CLAIM_FAILED`, después de **1.200 intentos, 598 observaciones y 253 comparables**. El artefacto conserva `feedClaimed:984`, 404.464 ms compartidos y 327.493 ms de rotación | La llamada fallida se identifica por inferencia del flujo como **`claim_catalog_refresh`, fase rotation**; no hay trace HTTP de ella ni código/mensaje original retenido |
| Solicitado, run [37427607976](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37427607976) | El job `6392c753-094e-4eb1-8174-81411c90655d` sí adquirió la tarea y terminó con **`no-observation`** sobre la publicación CompraGamer 10534 | No es evidencia de otro fallo de claim. El corte posterior del feed no prueba su estado histórico ni agotamiento |

La inferencia de la RPC adaptativa usa el código exacto `baaaa8ad9adf9f4ff08b2a06563065b56252840e`: `feedPhase` sólo cambia de `true` a `false`; el tiempo de rotación requiere haber cruzado esa transición; una adquisición posterior que devuelve `.error` elige `claim_catalog_refresh`. No permite identificar el ordinal real del lote, SQLSTATE, duración de esa llamada ni causa del servidor. El lote 51 de los tests es sintético.

Las lecturas autenticadas fueron de sólo lectura, con SQL dentro de `BEGIN READ ONLY/COMMIT`. En la ventana 06:55–07:35 UTC había 2.052 entradas Edge, 37 PostgREST y 14 PostgreSQL. Las PostgreSQL retenidas eran LOG/checkpointer con SQLSTATE 00000; las advertencias de timeout manager de PostgREST también aparecen fuera del incidente y no están atribuidas a la adquisición. No se encontró un Edge RPC no-200 en esa ventana ni una nueva adquisición entre el último progreso y el cierre. Es ausencia de evidencia suficiente, no prueba de ausencia de fallo.

Se consultaron definiciones RPC y límites actuales de roles, además de la [documentación de timeouts de Supabase](https://supabase.com/docs/guides/database/postgres/timeouts). La sesión no acredita que el fallo fuese un timeout, deadlock o contención del plan SQL. No se modificaron SQL, timeouts, concurrencia ni políticas de cola sobre esas hipótesis.

## Resultado de los cambios

1. **Diagnóstico durable del adaptativo.** El error conserva RPC, fase, ordinal, límite, duración y código permitido. Mantiene acumulados y el fallo primario incluso ante fallos secundarios de cierre. Una cobertura no leída queda desconocida, y se distingue el ACK final de una persistencia no confirmada.
2. **Resultados solicitados comprobables.** El artefacto distingue intentos, observaciones realmente guardadas, comparables y motivos internos. Stock agotado observado no equivale a oferta comparable; una persistencia rechazada no cuenta como observación. Se conservan resultados parciales.
3. **RAM contradictoria bloqueada.** El nombre literal DDR4 3200 sin MHz ahora contradice la publicación GamersPoint 3600 MHz. Las referencias comerciales o atributos omitidos no se convierten en velocidades conocidas. No se aprueba identidad ni se cambia frescura/stock.

Las garantías nuevas de cierre corresponden a un claim diagnosticado. Un fallo de liberación no acredita que se haya liberado la reserva. `summaryPersistence:confirmed` significa únicamente respuesta afirmativa del update final; no verifica un commit posterior. El solicitado que pierde el lease final conserva su excepción previa y no devuelve estos nuevos conteos.

## Fuentes RAM y CompraGamer

El GET público del feed CompraGamer del **07/10 01:09:16 UTC / 06/10 22:09 Santiago** devolvió 200 y 1.559 registros, sin el ID 10534. Corrobora la ausencia en ese corte, sin renovar la observación de la oferta ni declarar agotamiento.

La ficha Corsair Vengeance RS conserva publicaciones LPX: es un conflicto real de serie y continúa excluido. La Kingston 3200 conserva una fuente de 3600 MHz y otras sin prueba de atributos suficiente. Estos controles no se relajan para aumentar comparables.

El detalle Maximus 15359 contiene una plantilla Vue con múltiples estados: primer h1 «Artículo sin stock», título real posterior, JSON-LD 318.600/InStock y otros importes de plantilla 374.120/398.000. Retirar sólo el primer h1 hizo que el parser aceptara el JSON-LD antiguo en una prueba en memoria. Eso no acredita precio, pago o stock actual. Se leyeron dos scripts públicos referenciados; el detalle depende de `web.MAX.GetItemDetail_V6` vía PageMethods. No se ejecutó ese POST ni se alteró el adaptador: sigue pendiente de una extracción corroborada y pruebas de identidad/stock/precio por publicación.

## Verificación local

| Control sobre el diff final | Resultado |
|---|---|
| `npm run verify` | Lint y tipos aprobados; **1.688 unitarias aprobadas**, dos omitidas preexistentes; **25 controles operativos aprobados** |
| Diagnóstico/cierre focalizado | **48/48**, helper y adaptativo; seis casos de cierre repetidos por el revisor independiente |
| RAM/identidad focalizada | **52/52**, incluyendo SKU/MPN delimitados y contradicción real 3200/3600 |
| Artefacto del entrypoint real | **5/5**, JSON y salida de proceso; runners/transporte aislados, sin DB ni tiendas |
| Runner Node completo | Compilado con las opciones de CI; **390.143 bytes**, sin ejecutar adquisición/refresh |
| OpenNext final | Compilación y bundle aprobados; ocho documentos públicos verificados. Conserva el aviso preexistente de middleware Node experimental |
| Wrangler dry-run | Bundle aceptado y salida `--dry-run: exiting now`; no subió código |
| Diff | Sin errores de whitespace; revisión cruzada terminada, sin hallazgos materiales abiertos en el alcance |

La revisión cruzada detectó y corrigió dos problemas: falso conflicto RAM en `SKU (DDR4 3600)` y pérdida del diagnóstico primario ante errores de cierre. Catálogo comprobó independientemente los seis casos de cierre; ingeniería revisó conteos/OOS/redacción del solicitado. Los especialistas son GPT-6.1 Sol/high, máximo dos simultáneos, con archivos asignados.

El primer ensayo enfocado dejó dos fallos: la fixture solicitada predeterminada carecía de precio y no alcanzaba la persistencia. Se añadió precio válido y una aserción de la RPC efectivamente intentada; no se rebajó la expectativa. Las pruebas posteriores usan ese comportamiento real. La primera compilación se repitió después de corregir el cierre y el caso SKU para no atribuirle el diff final a un bundle anterior.

No se repitió una auditoría visual general: la primera entrega conserva sus recorridos escritorio/móvil y este diff cambia operación e identidad. Los nuevos casos se prueban offline y en compilación. No se ejecutó un refresh real, ni una migración, actualización de cuentas, publicación o compra.

## Unidades y evidencia

| Unidad | Contrato y reversión |
|---|---|
| [01-diagnostico.md](01-diagnostico.md) · `8188bf0` | Diagnóstico permitido, acumulados y cierre ante fallos secundarios; helper + adaptativo; 332 líneas autorales |
| [02-solicitados.md](02-solicitados.md) · `182f9e7` | Conteos/motivos solicitados y artefacto real; depende del helper de unidad 1; 221 líneas autorales |
| [03-ram.md](03-ram.md) · `7a249be` | Contradicción de velocidad conservadora; independiente de las otras unidades; 78 líneas autorales |
| Informe y evidencia | Incidentes, cortes, verificación y próximos criterios; no acredita recuperación comercial |

[diagnostico-supabase.json](diagnostico-supabase.json) contiene campos seleccionados de logs, RPC/roles actuales y resultado solicitado. [incidentes-y-fuentes.json](incidentes-y-fuentes.json) deriva los artefactos originales y GET públicos posteriores. Los logs completos de GitHub, HTML/scripts públicos, snapshots de implementación y bundles están en `tmp/`, ignorados; no se publican mensajes privados ni datos de autenticación.

## Siguiente paso y condición de cierre

La candidata está preparada para revisión y publicación autorizada. Después: verificar el runtime publicado y conservar el siguiente ciclo natural de diagnóstico/observación, sin contar disparos manuales u horarios como fechas útiles diarias G02. Un éxito del workflow no acredita ofertas útiles.

Si vuelve a fallar una adquisición, usar su RPC/fase/código/duración para elegir una corrección proporcional y probarla antes de tocar producción. En paralelo al seguimiento autorizado, el siguiente trabajo de fuente es Maximus: detalle real ligado a ITEM/PN/título y precio/stock/pago corroborados, con fixtures que no acepten plantillas o JSON-LD antiguo.

No hay nueva medición de cobertura ni ofertas recuperadas atribuibles a esta entrega. Se conservan la meta del 95%, los denominadores prioritarios y la muestra G02; las guardas de identidad, observación real y stock siguen activas. La causa de servidor del histórico y la recuperación útil permanecen abiertas.
