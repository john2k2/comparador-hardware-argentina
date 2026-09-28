# Actualización de presupuestos y alternativas — 28/09/2026

Jonathan eligió rearmar la guía de $2 millones para respetar ese objetivo. La selección revisada conservada en el corte de las 00:43 UTC sumaba ARS 1.934.428; ese importe no es un precio vigente garantizado. El control de las 13:32 UTC tenía solamente 1/7 piezas elegibles. Este trabajo mejora la renovación de la selección, sin convertir referencias históricas en ofertas comprables.

## Comportamiento aplicado

El botón agrupa publicaciones por pieza. Comprueba primero una publicación de cada grupo y, al terminar esa solicitud, pasa a otra publicación conocida únicamente para piezas sin oferta válida. Se permiten hasta tres rondas consecutivas, una solicitud en curso por vez, conservando los límites existentes: ocho objetivos por solicitud, tres solicitudes por IP en diez minutos, doce globales en diez minutos y cien por día. La visita a la guía no dispara consultas a tiendas.

Una oferta persistida informa por separado si es comparable: precio finito y positivo, stock disponible, observación reciente según la ventana vigente y sin revisión de identidad pendiente. Un resultado antiguo sin ese indicador no confirma una pieza. La guía vuelve a aplicar sus filtros de modelo, disponibilidad, frescura y precio antes de mostrarla. Esto no certifica compra ni compatibilidad física completa.

Se conservan referencias conocidas de hasta treinta días, incluso antes agotadas, únicamente para pedir una nueva comprobación. Las referencias agotadas nunca ingresan al subtotal ni a la lista comprable. Se mantienen HTTPS, ausencia de credenciales en URL, categoría/modelo y exclusión de combos/modelos contradictorios. La oferta actual se comprueba primero; las referencias restantes siguen la prioridad de observación reciente y luego precio. Si todas fallan no se inventa disponibilidad ni se reutiliza un precio vencido.

El sondeo conserva el mismo identificador de solicitud si sigue pendiente, falla temporalmente o el despacho inmediato no está disponible. Consultar estado reanuda ese trabajo antes de crear otro. Una cancelación detiene nuevas solicitudes y conserva una aceptación ya recibida. La lectura compartida de la guía mantiene su caché de cinco minutos para proteger al Worker; el botón informa esa demora adicional.

## Evidencia y límites

Pruebas focalizadas de worker, precios, compatibilidad, constructor, catálogo y sesiones: 84 aprobadas, incluidas doce de la sesión y la cancelación durante aceptación. TypeScript, ESLint focalizado y compilación optimizada aprobados. La prueba de referencia agotada usa una URL coherente con el modelo; se conserva el rechazo de una URL descriptiva que no corresponde al producto.

Chrome aislado, build local optimizado, 14:06:53 UTC: HTTP 200, siete objetivos iniciales, una segunda publicación para la GPU pendiente, mensaje final de siete ofertas actualizadas, cero errores JavaScript y ningún desbordamiento en 320, 390 y 1280 px. API interceptada con fixture; no se despachó ningún refresh real durante esa prueba. Captura inspeccionada. Evidencia privada: `cortes/2026-09-28/adsense-preparation/GUIA-ALTERNATIVAS-LOCAL.json` y `guia-alternativas-movil.png`.

La lectura local del catálogo ofrece alternativas para GPU, RAM, SSD, motherboard y fuente; CPU y gabinete conservan una sola referencia conocida. La comprobación no garantiza completar esos dos grupos ni que el total futuro se mantenga dentro de $2 millones. La guía informa cuando el subtotal está incompleto o supera el objetivo. Se requiere un nuevo corte de siete piezas disponibles antes de recomendar el armado como completo.

No cambia cron, credenciales, cuotas, CSP, consentimiento, publicidad ni infraestructura. G02 y G20 siguen abiertos. No se envía la solicitud de AdSense ni se activa publicidad por pasar estas pruebas. No cambió estado, responsable, fecha ni prioridad de tareas; el tablero se conserva.

## Unidades y reversión

1. Contrato de resultado comparable y selección de referencias: pruebas de worker/precios. Puede retirarse el campo opcional y el nuevo selector conservando el flujo anterior; no modifica tablas ni historial. El límite de tres alternativas pertenece al contrato compartido.
2. Sesión serial de comprobación: pruebas con callbacks simulados cubren límites, alternativas, solicitudes pendientes y errores/cancelaciones. La frontera runtime es request/poll, simulada; este módulo puro no consulta red ni base de datos por sí mismo. Puede retirarse tras devolver el panel a su comportamiento anterior.
3. Panel y ruta de guía: prueba de pantalla indicada arriba. Reversión conjunta de `GuideRefreshPanel` y su construcción de grupos en la página devuelve la comprobación anterior por pieza; no revierte otras correcciones de precio/stock o modelos exactos.

Publicación y control real posteriores se registrarán en un apartado adicional, sin sobrescribir este corte de fixture ni el histórico público.

## Publicación y primer control real

Commits: `cc744d9` (elegibilidad/referencias), `7db3c99` (sesión/pruebas) y `b2433da` (panel/ruta/documentación). Workers Build `67c8df39-ca78-4741-b937-f2c671e652ab` completado success a las 14:13:53 UTC, asociado a `b2433da`. Pruebas adicionales del módulo on-demand: 35 aprobadas y una omitida; no se cuenta la omitida como verificación de integración real.

Se inició una única sesión real desde la guía, a pedido de Jonathan, fuera de la automatización. Primera solicitud `a327399b-7073-4968-ac31-4d8d2170666d`, siete objetivos, creada 14:14:40 UTC y completada 14:15:30 UTC por [Requested offer refresh 36434506686](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36434506686), con el nuevo commit. Cuatro ofertas comparables: fuente, motherboard, SSD y gabinete. RTX4060 Shopgamer: observación agotada. CPU y RAM CompraGamer: precio/stock observados, pero revisión `provider-unavailable`, por lo que no se consideran elegibles. API pública con preferencia DB confirma CPU ARS354.700 y RAM ARS441.450, in-stock, observados a las 14:15:21 UTC; esos datos no habilitan su inclusión sin resolver identidad. No se atribuye aún el motivo HTTP, cuota o credencial de la indisponibilidad de Jev. El endpoint usado coincide con [la referencia oficial](https://docs.typesafe.ai/api); esa coincidencia no verifica acceso de la cuenta.

La segunda solicitud `d4ddd9d3-30d8-4395-bad2-4f76bb51ab88`, creada 14:15:33, contiene solamente alternativas de GPU y RAM. Quedó en cola: el segundo intento del runner ya había encontrado la cola vacía antes de que el sondeo del navegador detectara el primer resultado. El despacho está limitado a una ejecución cada cinco minutos y la consulta de estado no crea otra solicitud. Tras el límite de sondeo, la UI informa que sigue en curso y conserva su identificador mientras se mantiene esta vista.

Corrección focalizada del runner: espera diez segundos antes de su segundo lote. Conserva dos lotes máximos, frecuencia, permisos, cuotas y despacho; no garantiza recoger una alternativa que tarde más de esa espera ni elimina la dependencia de recuperación programada. Sintaxis Bash aprobada y ejecución del bucle real con `curl`/`sleep` simulados: una alternativa que llega cuatro segundos después del primer resultado se procesa en el segundo lote, exactamente dos llamadas. La espera consume como máximo diez segundos adicionales por ejecución con primer lote no vacío. Reversión independiente: retirar solo esa espera. Su próxima ejecución requiere evidencia real; no se declara que haya reparado retroactivamente el job en cola.

Los últimos dos runs programados de este workflow accesibles son del 27/09, a las 06:58 y 12:52 UTC, pese a la expresión de cinco minutos; el workflow está activo. No se ofrece la cadencia declarada como garantía de latencia real ni se modifica a ciegas el schedule. G02/G20 siguen abiertos por cobertura, revisión de identidad y recuperación de cola; esta sesión manual no suma un ciclo diario útil al criterio de cierre.
