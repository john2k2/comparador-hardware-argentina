# Mejoras de utilidad, precisión y captación

Implementación: 21 de septiembre de 2026, hora de Santiago. Complementa el análisis de competencia de esta carpeta.

## Unidades de trabajo

1. **Armador y revisión de ofertas.** Ocho componentes editables, contado/cuotas, envíos por tienda, compatibilidad con pendientes explícitos, guardado local, exportación y enlaces sin precios embebidos. Los ventiladores de gabinete y packs de ventiladores no reemplazan al gabinete ni al disipador de CPU. WhatsApp abre un mensaje editable; no envía mensajes automáticamente. Botón a la oferta exacta y eventos de uso sin presupuestos completos ni URLs compartidas en Analytics. Jev es una señal sobre la identidad; precios y disponibilidad salen de las tiendas. Migraciones aditivas y cola privada. Reversión operativa: apagar `ENABLE_ON_DEMAND_REFRESH` y `ENABLE_JEV_OFFER_REVIEW`; no borrar tablas.
2. **Acceso y páginas útiles.** Navegación al armador y tiendas, enlaces desde categorías/comparativas/guías, y piloto `/tiendas/{maximus,venex,mexx}`. Cada tienda lee como máximo 36 filas y presenta hasta 24 productos propios con fecha de oferta. Se excluyen ofertas inseguras, sin stock o con identidad pendiente/contradictoria. Solo se permite indexación con al menos seis productos y tres observaciones de las últimas 72 horas. El sitemap aplica el mismo control. Reversión: retirar enlaces y rutas de tiendas; no afecta datos del catálogo.
3. **Frescura verificable.** Una respuesta de actualización con cero productos deja de contar como éxito. La demanda sin resultados tiene una única consulta extra de recuperación, conservando el fallo inicial y los filtros de tiendas. Las actualizaciones autenticadas esperan la escritura completa (hasta 45 segundos) y propagan sus errores; la selección de tiendas se respeta también al actualizar por categoría. Desactivar scraping público no activa productos sintéticos de E2E. WooCommerce distingue una búsqueda redirigida a detalle y no mezcla sus productos relacionados. SCP usa el precio final publicado, no el importe sin impuestos. Descuento informado por una tienda se etiqueta como tal, sin presentarlo como una baja histórica. Reversión: retirar la recuperación adicional; mantener las fechas originales y el aviso de cero productos.

## Verificación antes de publicar

- 684 pruebas unitarias aprobadas, dos probes de red opt-in omitidos; incluye regresiones de persistencia, selección de tiendas, datos de E2E, accesorios y extracción de SCP.
- Cinco escenarios del armador comprobados en Chrome, incluyendo el caso de actualización con identidad pendiente y viewport móvil de 390 píxeles; última ejecución completa: cinco aprobados.
- TypeScript, lint y compilación Next aprobados con los últimos cambios. La compilación OpenNext del despliegue base fue correcta; el despliegue final vuelve a compilar.
- Las dos migraciones se aplicaron en Supabase y se registraron como aplicadas. Se verificó RLS activo, ausencia de lectura/escritura pública de la cola, RPC sin ejecución anónima y ejecución permitida al servicio.
- Se configuró el secreto de TypeSafe en Actions sin incorporarlo al repositorio ni al navegador; consumidor y revisión se habilitaron con variables del repositorio. El Worker mantiene el scraping fuera de las solicitudes públicas.

## Datos que limitan la promesa

Antes de la activación, Mexx y Maximus tenían última observación del 18/09 y Venex del 04/09. Ninguna oferta de esas tiendas cumplía inicialmente el umbral de 72 horas. Las páginas nuevas deben permanecer `noindex` hasta recuperar datos recientes.

La ejecución diaria del 21/09 (`35589635629`) había terminado en verde con la consulta `rx 6950 xt` y cero productos. Esto motivó la tercera unidad. Las ejecuciones programadas de Actions pueden demorarse: la actualización a pedido muestra espera y resultado; no promete respuesta instantánea.

Guardar varios presupuestos en la cuenta, alertas nuevas y optimización automática de compra en una tienda frente a varias quedan para otra etapa. La selección existente de bajas de la home utiliza historial de 24 horas; no se añadieron promesas de mínimo histórico de 30 o 90 días.

## Cierre público

- Publicación base y mejoras SEO confirmadas en Cloudflare: commits `85735a0` y `7b7068b`, ambos con despliegue exitoso. Armador y páginas de tiendas accesibles en el dominio público.
- Actualización pedida desde la web: trabajo `31f42186-5a1c-4ef2-bc25-9f21198c4be0`, [Actions 35678345201](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/35678345201), completado. Precio de Ryzen 5500 en Mexx actualizado a $158.569 y corroborado en la tienda. Jev devolvió 0,62: la identidad permanece pendiente y la oferta se excluye del total. Esto comprueba el circuito, no la precisión general de Jev.
- La ejecución de catálogo `35678347841` devolvió 1.385 productos pero no dejó fechas nuevas en las tres tiendas. La revisión encontró persistencia tolerante con límite de siete segundos y un filtro de tiendas omitido en categorías; se corrigieron ambos. Con las correcciones, una ejecución local autenticada contra las fuentes y la base reales guardó 100 productos. Lectura posterior a las 02:27 UTC del 22/09: Mexx 13 ofertas disponibles recientes (incluye la prueba a pedido), Venex 60 y Maximus 28. Estos conteos son de la base, no una promesa de stock al comprar.
- La prueba del armador conserva precio y fecha cuando hay revisión pendiente y permite elegir otra tienda. Los cinco E2E pasaron; la interfaz informa la exclusión en lugar de dar un total aparentemente completo.
- Pendiente de registrar para el último ajuste de persistencia: ejecución del consumidor desde Actions y revisión del despliegue final. El guardado real local no sustituye ese control.
