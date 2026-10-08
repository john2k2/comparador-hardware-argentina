# Continuidad SQL ante compactación local

`catalog-restructure-contracts.mjs` crea un clúster PostgreSQL 17.11 propio por socket UNIX, sin TCP ni variables del proyecto. Reaplica 73 migraciones existentes y bootstrap Auth con dos usuarios sintéticos. Conserva hashes de los archivos utilizados y no consulta una base remota.

Carga una fixture directamente, registra datos/definiciones y ejecuta cuatro suites SQL vigentes. Compacta productos, ofertas, historial y resúmenes; después de cada relación comprueba igualdad de todas las filas `public/auth` y de columnas/defaults/GENERATED/constraints/FK/índices/triggers/functions/ACL/RLS/policies. Repite las suites, oracle histórico numérico y diferencia de historial por cuotas/reintento. Las RPC de observación sólo se usan como tests en el clúster desechable, nunca para restaurar.

`node --test scripts/pilots/catalog-restructure-contracts.test.mjs`: tres pruebas aprobadas, incluida la integración con 12 grupos SQL en dos fases, 30 comparaciones de búsqueda y dos oracles de ocho días de medianas/conteos históricos. El clúster se verifica antes de operar, detiene y elimina al terminar. Ante detención incierta conserva sus temporales y marca fallo.

CLI: `node scripts/pilots/catalog-restructure-contracts.mjs tmp/restructuracion-2026-10-08/contracts-nuevo.json`. Recibo nuevo exclusivo 0600, directorio real 0700; no sobrescribe evidencia. Guardas rechazan otros directorios/URI/nombres de muestra. PostgreSQL Homebrew debe existir en `/opt/homebrew/opt/postgresql@17/bin/`.

Es continuidad sobre fixtures y SQL del repositorio: no demuestra igualdad contra funciones remotas, OAuth real, enlaces públicos, guías de tres horas, restauración selectiva/cutover ni disponibilidad. Tamaño, locks, WAL/disco máximo y duración productivos no se extrapolan de esta prueba. Rollback: retirar script/test/documento; no modifica servicios ni esquema del proyecto.
