# Lector de catálogo certificado

El lector D1 se inyecta explícitamente con un fingerprint esperado. Exige
un manifiesto completo, identidad de catálogo y conteos concordantes en los
metadatos. Los conteos globales se certifican en el controlplane, no en cada
request. Cada operación lee el corte actual y lo contrasta al terminar.

Los cambios de precio y reloj entre peticiones no exigen activar una nueva
identidad. Un cambio de corte durante una lectura descarta la respuesta.
La ficha valida categoría e ID de JSON contra las columnas SQL y reúne sólo
variantes exactas. La página se rechaza completa si el mapper contradice los
precios o la elegibilidad usados para contar y paginar.

Verificación: 20 tests SQLite aprobados, incluidos los dos rechazos de ID o
categoría discordantes. La revisión independiente reprodujo ese cierre.
El motor y el loader pasaron junto con Worker 34 tests. TypeScript, lint y
diff-check aprobados. La certificación de estos tests es una fixture: aún
se debe probar binding, carga y aplicación completos en el runtime.

Recuperación: retirar la conexión del backend para dejar de invocar el
lector; el módulo puro no activa rutas, cambia cuentas ni escribe datos.
