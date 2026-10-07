# Conservar el error de preparación de cola

El ciclo natural 37558743501 falló antes del claim. Tres llamadas a `seed_catalog_refresh_queue` fueron canceladas por `statement timeout`, SQLSTATE 57014. El artefacto anterior perdía el ordinal y registraba cero tiempo de preparación.

El runner ahora conserva hasta tres intentos del último lote, con RPC, fase, lote, intento, duración y código permitidos. La preparación se mide también cuando falla. Los errores secundarios de liberación, cobertura o cierre conservan la falla principal. No se copian mensajes, SQL, argumentos o credenciales.

Verificación focal: `npx vitest run src/lib/catalog/adaptive-refresh.test.ts src/lib/catalog/refresh-diagnostics.test.ts`: 77 aprobadas. Fixtures cubren respuesta y rechazo de promesa, límite de campos, intentos, tiempos y fallos secundarios. Runtime remoto: sólo lectura de logs y plan; no se ejecutó seed, claim ni refresh. El próximo ciclo natural de una versión publicada debe acreditar el resultado operativo.

Reversión: retirar esta unidad de `adaptive-refresh.ts`, `refresh-diagnostics.ts` y sus pruebas devuelve el diagnóstico anterior. No requiere restaurar datos ni modificar el SQL de seed, sus límites, permisos o reintentos.
