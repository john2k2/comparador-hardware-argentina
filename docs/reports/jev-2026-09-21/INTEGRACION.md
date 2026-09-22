# Integración de Jev para revisar ofertas

Estado al 21/09/2026, hora de Santiago: implementación local terminada y probada. Se realizó una llamada real a TypeSafe. Esta tarea no aplicó la migración de Supabase, no configuró secretos o variables remotos y no publicó ni activó la integración en producción. El interruptor de la aplicación viene desactivado.

Este documento describe la implementación posterior al diagnóstico y al piloto guardados en esta carpeta. Sus resultados históricos no deben interpretarse como estado de la aplicación actual.

## Comportamiento implementado

El scraping existente obtiene los datos. Después de agrupar resultados, el servidor revisa la relación entre el nombre del producto y el texto de la URL de cada oferta, para CPU, GPU y RAM. Jev recibe únicamente nombre, categoría y texto del camino de la URL; no recibe claves, parámetros de sesión, datos de usuarios ni conversaciones.

Las reglas locales detectan contradicciones explícitas de chip/sufijo y algunos atributos de RAM. Jev clasifica las ofertas seleccionadas como coherentes, contradictorias o insuficientemente determinadas. La respuesta se valida y queda vinculada al nombre, categoría y URL evaluados. Una revisión deja de servir si cambia esa identidad.

- Contradicción, evidencia insuficiente, confianza inferior a 0,8 o fallo del proveedor: oferta pendiente de corroboración.
- Coherencia textual con confianza suficiente: señal de identidad consistente; **no certifica precio, stock, SKU, compatibilidad ni vigencia**.
- Ofertas sin revisar: conservan el contrato anterior; no se presentan como verificadas por Jev. La integración inicial no cubre todo el catálogo.
- Los estados de stock desconocido o agotado no pueden ganar en las superficies modificadas.

La oferta pendiente permanece consultable en el detalle con aviso y fecha del precio. Se excluye de la elección de mejor precio en tarjetas, resumen de producto, comparativas y selección automática de componentes en las guías de presupuesto existentes. Si no queda una oferta elegible, la interfaz evita inventar un ganador o mostrar un precio de compra de $0. Las guías conservan su alternativa de estimación, identificada como tal.

La revisión se guarda aparte de precio y stock. No cambia la fecha de observación de la tienda ni genera un cambio artificial en el historial de precios. La actualización de una oferta que no recibió otra revisión conserva la anterior. Lectura y escritura admiten el esquema anterior durante el despliegue; antes de activar el modelo debe existir la nueva columna para conservar sus resultados.

## Límites y costo controlado

- Sólo corre en consultas de actualización autenticadas. Las visitas y búsquedas públicas no llaman a Jev.
- Requiere simultáneamente `ENABLE_JEV_OFFER_REVIEW=1` y `TYPESAFE_API_KEY` privada en el servidor que actualiza el catálogo.
- Modelo fijado: `jev-1.13.0`; contrato de instrucciones: `offer-identity-v1`.
- Máximo 16 ofertas enviadas al modelo por consulta de actualización, en lotes de 8; hasta dos llamadas si no hay caché. Las contradicciones que resuelven reglas locales no gastan llamadas.
- Tiempo máximo por llamada: 3 segundos, sin reintentos. Un fallo corta nuevas llamadas de esa consulta y deja pendientes sus candidatos seleccionados.
- Caché de 24 horas, vinculada a evidencia, modelo y versión del contrato. Reutilizarla conserva la fecha original de evaluación; no renueva el precio.
- Los trabajos con varias consultas multiplican ese límite. El cron actual pide una consulta de demanda al día; ejecuciones manuales pueden pedir más.

El umbral 0,8 es provisional, elegido después del piloto. No equivale a una precisión del 80 % y falta evaluarlo con una muestra independiente antes de ampliar el uso. La rapidez del modelo no se usa como criterio para aprobar una oferta.

## Evidencia y verificación

- `npm test`: **610 pruebas pasadas**, 126 archivos; una prueba real opcional omitida en la ejecución normal para no consumir cuota automáticamente.
- `npm run lint`: correcto; revisión adicional de los dos archivos modificados al terminar, también correcta.
- `npm run build`: compilación y comprobación de tipos correctas; lectura del catálogo compatible con el esquema previo. No se hizo despliegue de Cloudflare.
- `node --test scripts/pilots/catalog-quality.test.mjs`: las 9 pruebas del piloto siguen pasando.
- Pruebas de integración: revisión → serialización/lectura de catálogo → comparación/presupuesto; persistencia sin falsos eventos de precio; conservación de revisiones en actualizaciones mixtas; autorización, límites, caché, respuestas inválidas, timeout y errores del proveedor.
- Prueba de navegador local con los componentes reales y datos sintéticos: escritorio 1360×1100 y móvil 390×844; oferta pendiente visible pero sin premio de mejor precio, ausencia de ganador cuando sólo quedan pendientes, selección de cuotas y vuelta a contado. Sin errores de página ni desbordamiento horizontal móvil. La ruta temporal fue eliminada.

La llamada real del adaptador recibió dos casos públicos: una RAM con texto coincidente y un Ryzen 5600 con referencias a frecuencias base/turbo. El primero devolvió coherencia con confianza 0,83; el segundo, coherencia con 0,46, que nuestra política clasifica como pendiente. Consumo informado por el proveedor: 872 tokens de entrada y 95 de salida. Esta prueba verifica la conexión y el contrato, no mide precisión general ni prueba escritura en producción.

Evidencias: [respuesta real](ADAPTADOR-JEV-REAL.json), [validación de navegador](UI-validacion.json), [captura de escritorio](UI-escritorio.png), [captura móvil](UI-movil.png). Referencias del contrato: [API oficial](https://docs.typesafe.ai/api), [confianza](https://docs.typesafe.ai/confidence) y [elección de alternativas](https://docs.typesafe.ai/primitives/choice).

## Activación preparada

1. Aplicar `supabase/migrations/20260922000000_offer_identity_review.sql`: agrega una columna JSONB opcional; no modifica RLS.
2. Publicar la versión que entiende las revisiones, manteniendo el interruptor apagado durante la comprobación inicial. Las claves de Jev no van en el navegador ni en variables `NEXT_PUBLIC_*`.
3. Configurar el secreto `TYPESAFE_API_KEY` y la variable `ENABLE_JEV_OFFER_REVIEW=1` en GitHub Actions. El workflow ya está preparado para pasarlos al proceso local de actualización; no hace falta esa clave en el Worker público si sólo actualiza Actions.
4. Ejecutar una actualización acotada a una consulta, comprobar la revisión persistida por oferta y validar la ficha y comparativa públicas con esos datos. Medir abstenciones y contradicciones antes de ampliar cobertura.

Reversión: poner `ENABLE_JEV_OFFER_REVIEW=0` detiene nuevas consultas al modelo. No borra ni aprueba automáticamente revisiones pendientes ya guardadas.

## Alcance pendiente

La implementación refuerza la coherencia de las ofertas utilizadas por funciones existentes. No agrega todavía un armador completo de PC, validación integral de compatibilidad, cotización de envío, actualización de todas las tiendas en tiempo real ni corroboración automática de cada ficha. El diagnóstico anterior de antigüedad del catálogo sigue requiriendo trabajo de actualización de fuentes; Jev no lo resuelve por sí mismo.
