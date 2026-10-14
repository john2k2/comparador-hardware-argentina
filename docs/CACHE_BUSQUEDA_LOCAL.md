# Caché de respuestas del Worker local

`response-cache.mjs` usa Cache API con clave SHA256 de todos los filtros,
paginación, evidencia y generación. TTL máximo de 60 segundos, acotado por el
intervalo del catálogo. El reloj nunca renueva una observación de oferta.

El Worker valida el marcador de D1 incluso en HIT: una consulta y una fila.
En MISS lo vuelve a leer al terminar y descarta mezclas entre generaciones.
Sólo guarda respuestas 200 completas. Un error de base falla aunque exista
caché anterior. Solicitudes iguales comparten el cálculo dentro del proceso.

Validación: 16 tests, incluidos Cache API/D1 real en workerd local, expiración,
generación, errores, filtros y concurrencia. En cinco consultas del catálogo
real, MISS y HIT devolvieron el mismo JSON; cada HIT leyó una fila.
No demuestra velocidad remota ni caché global: Cloudflare mantiene cachés
por centro de datos. El navegador recibe `no-store`.

Reversión: retirar el módulo y sus tests, y volver Worker/UI al lector directo.
No hay cambios de configuración de producción ni datos de usuario en estas claves.
