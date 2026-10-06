# Conciliación de cambios locales — 6 de octubre de 2026

## Alcance y base

Comparación contra `main` publicado en `baaaa8ad9adf9f4ff08b2a06563065b56252840e`, confirmada directamente en GitHub. Se revisaron la carpeta principal, el borrador inicial del panel y el commit local de protección contra escáneres. La copia de la auditoría seguía activa y sus registros de seguimiento se conservaron.

El inventario cuenta referencias por copia de trabajo; un mismo archivo puede aparecer en las dos copias.

| Copia | Modificados sin commit | Nuevos sin commit | Total revisado |
|---|---:|---:|---:|
| Carpeta principal | 19 | 47 | 66 |
| Borrador inicial del panel | 2 | 43 | 45 |
| Total | 21 | 90 | 111 |

## Resultado

- **37 referencias idénticas** al contenido ya publicado. No requieren volver a subirlas.
- **43 referencias diferentes**: se contrastaron contenido e historial. Corresponden a implementaciones anteriores, informes con anexos históricos y una corrección necesaria en el filtro DS3H.
- **31 referencias sólo locales**: 30 documentos o evidencias históricas, y el antiguo script `scripts/measurement-read-live.mjs`. Su función ya está cubierta por el recopilador externo publicado; no hace falta incorporar el script anterior.

Los informes completos de cuentas, métricas privadas, autorizaciones y seguimiento comercial, las capturas del prototipo y los libros de seguimiento se conservaron localmente. No son dependencias de la aplicación. Sus números y estados corresponden a cortes fechados y no deben sustituir el estado actual del panel.

## Código ya incorporado

| Área | Resultado del contraste |
|---|---|
| Portada, tarjetas, pie y aviso comercial | Las versiones publicadas incorporan la búsqueda visible, legibilidad, avisos de afiliación, reglas de ofertas comparables y optimización de navegación. El borrador anterior no debe reemplazarlas. |
| Precios, stock e identidad | Se conservan los controles adicionales de URL, identidad, variantes y observación real. Las reglas de catálogo de 24 h y de guías/armador de 3 h siguen separadas. |
| WooCommerce | La extracción del precio principal ya está incorporada y reforzada para no heredar precio, stock o SKU de productos relacionados. |
| Eneba | El piloto ya está publicado con validación de enlaces, consentimiento y lectura de muestras preparadas fuera del Worker. La consulta original del feed se conserva en el productor externo. |
| Panel privado | La versión publicada añade lecturas externas, resumen privado acotado, recarga de datos guardados y protección de acceso. Los archivos del prototipo son anteriores a esos cambios. |
| Migración de ranking | La diferencia de 3 a 24 horas corresponde a la política de frescura del catálogo ya incorporada. No se reaplicó ni reemplazó la migración. |
| Protección de escáneres | La intención del commit local `b1c6a4f` está incorporada mediante `d2b88d4`, conservando el Worker y el scheduler actuales. No se subió el punto de entrada antiguo. |

## Corrección que sí hacía falta

`src/lib/search/search-ranking.ts` contenía `ds24h` en la lista de variantes estrictas. El cambio de frescura del 1 de octubre había alterado el identificador de modelo `ds3h`; las reglas de identidad y las funciones SQL conservaban el identificador correcto.

La búsqueda `Motherboard Gigabyte B550M DS3H` aceptaba indebidamente `Motherboard Gigabyte B550M AORUS Elite` y `Motherboard Gigabyte B550M S2H`. La corrección restaura `ds3h` sin modificar la frescura de ofertas.

## Verificación

- Reproducción anterior al arreglo: los dos casos de modelos distintos fallaron porque el filtro los aceptaba.
- Después del arreglo: DS3H y su revisión se aceptan; AORUS Elite y S2H se rechazan. Una búsqueda sin DS3H sigue permitiendo otros modelos del chipset.
- Contraste de ejecución del módulo compilado para el entorno web: cinco escenarios correctos después del arreglo y dos falsos positivos reproducidos en la versión anterior, sin peticiones a proveedores.
- Pruebas enfocadas: **146 aprobadas en 12 archivos**, incluyendo búsqueda, identidad, precios, WooCommerce, Eneba y permisos/lecturas del panel.
- TypeScript, ESLint de los archivos modificados y comprobación del diff: aprobados.
- Construcción de Next, empaquetado OpenNext y empaquetado de Wrangler en modo de prueba: aprobados; ocho documentos preparados verificados.
- El cambio no modifica migraciones, datos de cuentas, credenciales, roles de usuarios, infraestructura ni facturación.

La unidad de publicación comprende el filtro, sus cinco casos de regresión y este informe. La reversión se limita a esos tres archivos y no requiere una operación de base de datos.

La conciliación no cierra el incidente independiente de límites de procesamiento 1102/503 ni las autorizaciones pendientes de métricas.
