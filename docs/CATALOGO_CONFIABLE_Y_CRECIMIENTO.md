# Catálogo confiable y crecimiento

Este documento describe cómo se convierte una búsqueda del público en una mejora del catálogo sin exponer a cada visitante a errores, bloqueos o demoras de las tiendas.

## Recorrido de una búsqueda

1. La web responde desde el catálogo persistido y su caché.
2. Si encuentra precios viejos, registra la intención de actualización sin demorar la respuesta.
3. Si no encuentra una búsqueda o categoría, registra la demanda agregada durante catorce días.
4. El trabajo diario de GitHub prioriza una demanda reciente. Si no hay demanda, actualiza un producto marcado como importante o vencido.
5. El resultado nuevo vuelve al catálogo y queda disponible para las siguientes visitas.

El scraping en una visita pública queda desactivado en producción. Un administrador puede habilitarlo temporalmente con `ENABLE_PUBLIC_LIVE_SCRAPING=1`; el refresco autenticado sigue autorizado para actualizar precios.

## Controles de confiabilidad

- Los precios inválidos y los valores extremos se eliminan antes de calcular el mejor precio, el promedio y las comparaciones.
- Una tienda que devuelve `403` o `429` queda en pausa por 30 minutos. Tres errores consecutivos la pausan por 10 minutos. Una respuesta correcta elimina esa pausa.
- Las búsquedas reconocen términos equivalentes, por ejemplo GPU, placa de video y tarjeta gráfica; CPU, micro y procesador; SSD, RAM, fuente y motherboard.
- La relevancia favorece ofertas con stock, varias tiendas comparables y datos más recientes. La tarjeta muestra cuándo se actualizó el resultado.

## Métricas que deben revisarse

Cada semana se revisan en GA4 y en el panel operativo:

| Señal | Qué indica | Acción cuando empeora |
| --- | --- | --- |
| Búsquedas sin resultados | Demanda que el catálogo no cubre | Confirmar que entró en la cola y priorizarla en el siguiente refresh. |
| Clicks hacia tiendas | Intención comercial y valor para posibles sponsors | Comparar por categoría, tienda y posición. |
| Selecciones patrocinadas | Rendimiento de una ubicación comercial | Informar impresiones, clicks y tasa de selección con claridad. |
| Contactos comerciales | Interés de tiendas o sponsors | Medir formularios o clicks al correo como `generate_lead`. |
| Tasa de éxito y bloqueos por tienda | Calidad del scraper y disponibilidad de precios | Mantener la pausa, ajustar el scraper y verificar con una ejecución limitada. |
| Frescura de precios | Confianza del usuario en los resultados | Subir prioridad de categorías con datos vencidos. |

## Cadencia inicial

- Diario: un refresh de bajo costo, dirigido por demanda y con reemplazo por catálogo importante/vencido.
- Semanal: revisar el panel operativo, las búsquedas sin resultado y los eventos de clic en GA4.
- Mensual: revisar Search Console, las categorías que atraen visitas, los clicks hacia tiendas y una propuesta comercial basada en datos reales.

Antes de vender una ubicación patrocinada, el reporte debe separar claramente tráfico, impresiones, selecciones patrocinadas y clicks hacia comercios. La condición de patrocinado debe ser visible y no modificar el orden orgánico de precios.

## Límites actuales

- El refresh diario procesa una consulta para mantener el costo controlado; las demandas se ordenan por cantidad y recencia.
- La cola usa `api_cache_entries`, por lo que no requiere una migración de Supabase y vence sola.
- El estado de una tienda se conserva en la caché compartida. Si ese servicio no está disponible, el scraper conserva sus límites propios y el panel debe considerarse incompleto hasta recuperar la persistencia.
