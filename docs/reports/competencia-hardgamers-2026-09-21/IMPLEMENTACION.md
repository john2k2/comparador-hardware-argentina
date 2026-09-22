# Mejoras de utilidad, precisión y captación

Implementación: 21 de septiembre de 2026, hora de Santiago. Complementa el análisis de competencia de esta carpeta.

## Unidades de trabajo

1. **Armador y revisión de ofertas.** Ocho componentes editables, contado/cuotas, envíos por tienda, compatibilidad con pendientes explícitos, guardado local, exportación y enlaces sin precios embebidos. WhatsApp abre un mensaje editable; no envía mensajes automáticamente. Botón a la oferta exacta y eventos de uso sin presupuestos completos ni URLs compartidas en Analytics. Jev es una señal sobre la identidad; precios y disponibilidad salen de las tiendas. Migraciones aditivas y cola privada. Reversión operativa: apagar `ENABLE_ON_DEMAND_REFRESH` y `ENABLE_JEV_OFFER_REVIEW`; no borrar tablas.
2. **Acceso y páginas útiles.** Navegación al armador y tiendas, enlaces desde categorías/comparativas/guías, y piloto `/tiendas/{maximus,venex,mexx}`. Cada tienda lee como máximo 36 filas y presenta hasta 24 productos propios con fecha de oferta. Se excluyen ofertas inseguras, sin stock o con identidad pendiente/contradictoria. Solo se permite indexación con al menos seis productos y tres observaciones de las últimas 72 horas. El sitemap aplica el mismo control. Reversión: retirar enlaces y rutas de tiendas; no afecta datos del catálogo.
3. **Frescura verificable.** Una respuesta de actualización con cero productos deja de contar como éxito. La demanda sin resultados tiene una única consulta extra de recuperación, conservando el fallo inicial y los filtros de tiendas. Descuento informado por una tienda se etiqueta como tal, sin presentarlo como una baja histórica. Reversión: retirar la recuperación adicional; mantener las fechas originales y el aviso de cero productos.

## Verificación antes de publicar

- 671 pruebas unitarias aprobadas, dos probes de red opt-in omitidos; dos regresiones adicionales del actualizador aprobadas después.
- Cuatro escenarios del armador comprobados en Chrome. Se corrigió un selector ambiguo del test al agregar navegación de tiendas y se repitió satisfactoriamente el escenario de compartir.
- TypeScript, lint, compilación Next y OpenNext aprobados. Repetir la compilación de producción en el despliegue con los últimos cambios del actualizador.
- Las dos migraciones se aplicaron en Supabase y se registraron como aplicadas. Se verificó RLS activo, ausencia de lectura/escritura pública de la cola, RPC sin ejecución anónima y ejecución permitida al servicio.
- Se configuró el secreto de TypeSafe en Actions sin incorporarlo al repositorio ni al navegador; consumidor y revisión se habilitaron con variables del repositorio. El Worker mantiene el scraping fuera de las solicitudes públicas.

## Datos que limitan la promesa

Antes de la activación, Mexx y Maximus tenían última observación del 18/09 y Venex del 04/09. Ninguna oferta de esas tiendas cumplía inicialmente el umbral de 72 horas. Las páginas nuevas deben permanecer `noindex` hasta recuperar datos recientes.

La ejecución diaria del 21/09 (`35589635629`) había terminado en verde con la consulta `rx 6950 xt` y cero productos. Esto motivó la tercera unidad. Las ejecuciones programadas de Actions pueden demorarse: la actualización a pedido muestra espera y resultado; no promete respuesta instantánea.

Guardar varios presupuestos en la cuenta, alertas nuevas y optimización automática de compra en una tienda frente a varias quedan para otra etapa. La selección existente de bajas de la home utiliza historial de 24 horas; no se añadieron promesas de mínimo histórico de 30 o 90 días.

## Cierre público

Pendiente de registrar después de desplegar: versión publicada, prueba de cola desde el sitio público, resultado del consumidor y comprobación de las páginas nuevas. Los checks locales no reemplazan esa evidencia.
