# Exportación del piloto de historial

Unidad manual fuera del Worker. Requiere Node 22+ y la dependencia Supabase ya fijada en el lockfile; no instala paquetes ni cambia el sitio.

- Proyecto fijado: `zyiyziubpcpgoqlkcrie`. Sólo acepta su URL HTTPS y configuración privada de servidor; nunca usa una clave pública para operar Storage.
- Corte exclusivo fijo: `2026-07-09T00:00:00.000000Z`. `snapshotAt` es un ancla del piloto del 07/10 a las 19:16:07 UTC, no un snapshot transaccional de la extracción posterior.
- Exporta hasta 1.000 filas, páginas de hasta 250 por UUID ascendente y un máximo de 8 MiB de CSV. Una falla aborta sin entrega parcial exitosa. El cursor permite preparar continuaciones locales, sin acreditar completitud global.
- CSV conserva NUMERIC como texto, incluyendo signo del precio original, y diferencia null de texto vacío. El timestamp UTC conserva sus seis decimales. No utiliza números JS para redondear dinero.
- El directorio debe ser nuevo. Los archivos tienen permisos privados y el manifiesto se escribe después de los chunks. Una interrupción conserva restos locales para inspección y no reemplaza otra extracción.
- `--date` restringe exportación a un día UTC íntegro anterior al corte; verify/upload comprueban el mismo día antes de abrir credenciales.

## Uso local

Preparar el directorio padre bajo `tmp/`; la configuración de servidor permanece fuera de Git. Ejemplo de la operación ejecutada por coordinación:

```sh
node scripts/history-archive-pilot.mjs export --server-config /ruta/privada/.env.local --date 2026-07-05 --out tmp/history-archive-pilot-2026-10-07/source
node scripts/history-archive-pilot.mjs verify --date 2026-07-05 --out tmp/history-archive-pilot-2026-10-07/source
```

`--cutoff` y `--snapshot-at` se rechazan para impedir una ampliación accidental. No hay refresh, INSERT, UPDATE, DELETE, migración, cambio de scheduler ni subida automática en export/verify.

## Verificación y rollback

`node --test scripts/lib/history-archive-export.test.mjs scripts/lib/history-archive-cli.test.mjs`: siete casos verifican CSV/precisión, fechas, null, páginas/cursor, falla parcial y rechazo del día/corte indebidos. La extracción real del 07/10 completó cuatro páginas y 759 filas del 05/07; no constituye un respaldo global.

La unidad depende de codec y adaptador Storage previos. Rollback: retirar sólo `scripts/history-archive-pilot.mjs`, `scripts/lib/history-archive-export.mjs`, sus dos archivos de tests y este documento. Las copias locales y los objetos privados ya creados no se eliminan al retirar el programa.
