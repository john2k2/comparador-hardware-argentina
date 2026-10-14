# Rutas públicas y SSR con catálogo D1 seleccionado

La búsqueda SSR y las APIs de búsqueda/listado/detalle usan directamente
el lector certificado cuando se selecciona D1. No reutilizan páginas
cacheadas de otro backend, fixtures de prueba ni scraping. Tampoco escriben
demanda o caché antigua en Supabase. La admisión y la autorización de bypass
se conservan antes de responder. Un fallo D1 devuelve 503; un ID inexistente
devuelve 404. Las respuestas al navegador son `no-store`.

Tests focalizados verifican ausencia de caché/demanda/scraping, 429 antes
de leer, error sin vacío sintético y las diferencias entre 404 y 503.
La ejecución conjunta de seis suites dio 104 tests aprobados; TypeScript y
lint aprobados. El runtime local de la aplicación completa confirmó API,
HTML inicial, tarjetas y redirección canónica para Corsair. La categoría
completa aún rechaza un resumen histórico incompatible: ese dato no se
oculta ni cuenta como validación pasada.

La caché segura de respuestas del piloto aún debe incorporarse al lector
común; esta separación impide mezclar generaciones mientras se completa
esa etapa. No se activó el selector en el dominio público.

Recuperación: apagar el selector conserva el comportamiento anterior.
Estas ramas y sus tests pueden revertirse sin cambiar cuentas ni datos.
