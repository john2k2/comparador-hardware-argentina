# Operación manual del lote de 250

El CLI está fijado al proyecto zyiyziubpcpgoqlkcrie, corte 2026-10-07T20:10:00.000000Z y SHA-256 del recibo de selección 28200f5820003ab6634f2acd09ac0322a61395bfb5d3175d230b271b99aee009. Rechaza otra selección antes de leer configuración privada. No admite apply, delete, create-bucket ni cortes libres.

`scripts/telemetry-backup-pilot.mjs` admite export, upload, download y check-source; exige `--server-config`, `--selection`, `--archive`. Download y check-source requieren `--out`; los otros comandos lo rechazan. Los argumentos de configuración sólo identifican un archivo privado existente; no pasar claves por línea de comandos.

Export obtiene cinco páginas CSV de 50 claves, conserva los seis campos y escribe un directorio nuevo: CSV original, gzip, manifiesto y recibo. Fuente GET-only, CSV hasta 4 MiB en el CLI. No es un snapshot transaccional. Dos anclas de fechas no detectan por sí solas un cambio de payload sin cambiar metadata; check-source contrasta todos los campos mediante el respaldo canónico.

Upload valida el archivo y copia dos objetos privados inmutables. Download puede usar un directorio con sólo manifest.json; la selección externa sigue necesaria. La prueba real usó custodia sin gzip y otro directorio vacío para recuperar. Check-source posterior confirmó los 250 registros intactos en sus seis campos.

Directorios nuevos 0700 y archivos 0600, sin overwrite. Un recibo existente también se conserva: no confundir un fallo posterior al upload con rollback remoto. Manifiesto/anclas deben conservarse junto a una copia del recibo de selección, fuera de Git. Payloads, CSV, claves y SQL con datos sólo quedan en los directorios privados de evidencia.

Prueba enfocada: `node --test scripts/lib/telemetry-backup-cli.test.mjs`, 2/2. Rechaza comandos/flags mutantes y selección alterada antes de env/red. Runtime: export/upload/download/check-source exitosos sobre la muestra exacta. No requiere build Next porque no toca aplicación, rutas, UI ni dependencias.

Rollback local: retirar el CLI y su test; no modifica fuente, scheduler, backup existente ni credenciales. El reporte conserva cómo recuperar la entrega aún si se retira este wrapper.
