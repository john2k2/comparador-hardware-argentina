# Captura pública para estudiar almacenamiento

`catalog-restructure-capture.mjs` lee cuatro tablas permitidas del proyecto mediante GET, con origen fijo y redirecciones rechazadas. No admite tabla de usuario, RPC, endpoint alternativo ni operación de escritura. La clave server-side procede del entorno autorizado, nunca de argumentos. La salida de consola contiene sólo conteos y motivo de error sanitizado.

Interfaz: `node scripts/pilots/catalog-restructure-capture.mjs metadata.json salida-nueva.json`, con rutas reales dentro de `tmp/restructuracion-2026-10-08` (0700). Metadatos/resultado privados 0600; creación exclusiva sin sobrescritura. Valida URL del proyecto antes de usar credenciales. Puede suministrarse el entorno mediante `node --env-file=<archivo-local-autorizado>`; no escribir claves en el comando.

Lee hasta cinco ventanas de 1.000 filas por tabla, distribuidas por clave primaria y población estimada. Cada cuerpo completo registra fecha, hash y tamaño; límite conjunto 32 MiB/180 segundos, 20 segundos por request. Con error o exceso no guarda una muestra parcial. Sólo se guardan columnas públicas completas; no se exportan cuentas.

La muestra no es transaccional, aleatoria garantizada ni cerrada por FK. El parseo JSON no convierte esta captura en un backup de fidelidad decimal completa. Sirve para medir un laboratorio físico y requiere límites explícitos al extrapolar. No habilita restaurar/eliminar datos ni garantiza capacidad productiva.

Verificación: `node --test scripts/pilots/catalog-restructure-capture.test.mjs`, cinco aprobadas: selección distribuida, origen/tablas, GET sin body, rechazo de fallos/filas incompletas y cancelación por exceso de bytes. Rollback local: retirar script/test/documento; ningún servicio remoto depende de ellos.
