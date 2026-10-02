# Eneba integrado y prioridades — 02/10/2026

Corte público: **19:45 UTC**. Cuenta habilitada tras la acción de Jonathan: desapareció «Your account is not active», con identificador público Comparador_Hardware_Argentina y comisión del 5%. No se revisaron datos privados de facturación, banco ni pagos. Esto no acredita ventas ni cobros.

## Integración comprobada

`/juegos-digitales` está publicado desde el footer, con dos juegos de PC revisados, aviso de afiliación, plataforma, edición, restricciones y fecha del feed. Conserva noindex/nofollow y no integra juegos en búsqueda o rankings de hardware. No activa anuncios de Google ni anuncia un descuento sin confirmación.

El código previo fue revisado y portado al checkout actualizado. Se corrigieron una opción de fetch incompatible con Workers y, posteriormente, HTTP 403 de Eneba a ese servidor. No se atribuye el bloqueo a cookies, token o cuota sin evidencia. La descarga ahora la hace un productor Node dedicado de GitHub; el Worker sólo lee una muestra privada en la tabla de caché existente. Una visita no consulta Eneba ni escribe o borra la muestra.

Primera ejecución **manual**, [37055791619](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37055791619), código `fe09010`, terminó success a las 19:42:21 UTC. Dos ofertas del feed fechado **19:42:17 UTC** persistidas y comprobadas mediante Supabase MCP. Expiran a las 01:42:17 UTC del 03/10, sin renovar fechas al leer. Precios históricos del corte: Chivalry II ARS 8.971,18; Knights of Pen & Paper ARS 4.288,33. La página avisa de posibles cargos y exige confirmar vendedor e importe final en Eneba; el feed no proporciona fecha individual de precio.

El productor está programado cada cuatro horas nominales, una página de seis filas, 256 KiB y ocho segundos, sin paginación o reintentos. Una falla conserva la muestra anterior hasta su vencimiento real. La ejecución manual no prueba continuidad del cron ni suma un ciclo G02. La revisión de activación de los juegos vence el 09/10 a las 17:48:55 UTC; se revisará el 05/10, sin renovar fechas automáticamente.

Runtime: Worker `96fd116a-ec63-47dc-94fe-45805b5a97a3`, 19:43:01 UTC. A las 19:45 UTC, escritorio 1280 y móvil 390: API ready con dos ofertas, enlaces exactos y afiliado correcto, rechazo sin analítica, aceptación con una vista y un clic propio, sin desbordamiento, errores JS, violaciones CSP o scripts publicitarios en la muestra. Google y destinos Eneba se interceptaron en la prueba: confirma comportamiento, **no recepción de eventos ni atribución comercial**.

[CI 37055794266](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37055794266) aprobada: 1.235 unitarias y dos omitidas, 19 operativas, SQL/concurrencia y 55 críticas de navegador. Lint/TypeScript aprobados. La CLI desactivada no consulta fuente ni necesita credenciales.

## Medición y seguimiento

Se guardaron en Chrome dos dimensiones de evento de GA4 y se confirmó su existencia mediante MCP oficial: `customEvent:affiliate_product_id` (Juego afiliado) y `customEvent:affiliate_campaign` (Campaña afiliada). Los eventos propios son `affiliate_pilot_view` y `affiliate_outbound_click`, campaña `eneba_pc_ar_20261002`. No sumar el clic automático genérico ni `outbound_store_click`. La recepción real, usuarios, clics de visitantes, ventas y comisiones siguen **no verificados**, nunca se registran como cero por falta de datos.

G27 queda **en observación**, P2, con evaluación propuesta al 30/10. No se cierra por habilitar una cuenta o publicar código. El control del 05/10 revisará continuidad automática, integridad de destinos, restricciones y recepción GA4; los lunes contrastará resultados accesibles de Eneba. Con menos de 50 usuarios con clic, la muestra es escasa y no justifica ampliar el catálogo. Es un umbral inicial propuesto, no garantía estadística.

El tablero de `outputs/project-tracker-2026-10-02-eneba` conserva su hoja, Gantt, fórmulas y fuentes. G07 continúa en implementación con próximo control 05/10 para recepción de eventos nuevos; su validación histórica no se borra. G27 queda registrado en BACKLOG y en la nota de fuentes del tablero porque las 40 filas de la plantilla están ocupadas; no se sustituyen otras tareas ni se presenta como completa.

## Próximas tres prioridades

1. **G02 y calidad del hardware (P0):** seis fechas diarias útiles verificadas. Artefacto horario 37047419206 a las 18:27:33 UTC: muestra fija 37/56 <=24 h, 0/56 <=3 h y 0/9 fichas con oferta aceptada reciente. No demuestra agotamiento. No cerrar por siete jobs verdes: falta cobertura, variantes/URLs verificadas y la meta de frescura. Conservar los nueve IDs, histórico y criterios.
2. **G07 y demanda real (P0):** verificar recepción y atribución de salidas/CTA; importar sólo agregados anónimos autorizados desde el 12/10, con datos 03–09/10 y rutas de productos exactas. Juegos de Eneba no pertenecen a esos agregados ni prueban demanda de componentes.
3. **G27 acotado (P2):** medir el piloto y confirmar atribución real antes de ampliarlo. No cuenta como sponsor con pago fijo; no posponer correcciones de hardware para añadir juegos.

Catálogo adaptativo independiente, nativo schedule 37048933125, 18:40–18:57 UTC, GitHub success / estado interno deadline: 1.488 intentos, 475 observaciones, 241 comparables, 964 sin observación y 49 fallos de fuente; sin fallo de persistencia registrado. Katech: 48 altas HTML separadas. Cobertura prioritaria observada <=24 h **9.562/34.242 (27,92%)**; general **19.445/71.770**, 52.288 sin intento. El denominador subió por 48 altas y dos prioritarias; no es cohorte fija ni 95% logrado. No sumar observaciones entre runs como únicas. Estos valores son históricos y no se sustituyen por números posteriores sin nueva fuente.

Jev no se consultó en este corte: evaluate_options no estaba expuesto entre las herramientas disponibles. No se inventa su aprobación ni se desactiva la identidad del hardware. La decisión del productor se sustentó en error reproducido, respuesta real, persistencia y prueba pública.

Fuentes: [integración y evidencia](../eneba-piloto-2026-10-02/INTEGRACION.json), [contrato y plan](../eneba-piloto-2026-10-02/README.md), artefactos GitHub identificados, Supabase de sólo la fila del piloto, Chrome propio y MCP oficial GA4. Capturas y logs quedan locales e ignorados; sin conversaciones, credenciales ni datos privados en el repositorio. El código publicado se mantiene en el checkout de implementación `~/.codex/worktrees/catalog-adaptive-refresh/comparador-hardware-argentina`; el checkout principal conserva sus cambios ajenos pendientes.
