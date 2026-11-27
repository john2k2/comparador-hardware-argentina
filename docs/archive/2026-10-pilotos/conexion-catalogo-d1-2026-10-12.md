# Selección explícita de catálogo D1

`CATALOG_READ_BACKEND=d1` requiere `CATALOG_FINGERPRINT` y binding
`CATALOG_DB`. Apagado, el selector no carga el SDK ni consulta D1. Activado,
un error de configuración, manifiesto o lectura se propaga: no cambia de
catálogo silenciosamente. Auth, RLS y escrituras Supabase no se modifican.

Paginado, detalle y resolución canónica comparten el lector. Se conservan
inferencia de categoría, normalización de tiendas y límites de página. Los
diagnósticos distinguen cero RPC Supabase de la duración externa de D1.

Verificación conjunta con las rutas: seis suites, 104 tests aprobados;
TypeScript y lint aprobados. El paquete completo OpenNext actual se probó
en workerd con un binding D1 local certificado de 20 productos: búsqueda
API y SSR, ficha y redirección canónica funcionaron. La primera compilación
aislada tomó artefactos antiguos; se reconstruyó en `.next` y se comprobó
que el bundle contiene el selector actual.

La categoría completa detectó un precio histórico que el mapper rechazaba
correctamente. Se devuelve error, por lo que aún falta corregir la copia
del catálogo antes de habilitarlo. Lectores generales de guías, home y
armador permanecen en Supabase. Este commit no activa variables/bindings
públicos ni acredita producción.

Recuperación: apagar el selector devuelve las lecturas al backend anterior.
La conexión se puede retirar junto con sus tests sin modificar datos.
