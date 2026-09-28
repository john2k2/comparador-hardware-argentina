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
