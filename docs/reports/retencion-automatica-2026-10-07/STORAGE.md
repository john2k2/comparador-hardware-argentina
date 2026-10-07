# Transporte y custodia privada

Se reutiliza el contenedor privado existente y el helper manual de dos objetos. Esta unidad agrega selection.json bajo el mismo prefijo de manifiesto, sin cambiar ese helper ni sus tests. Los tres archivos son inmutables, máximo 1 MiB cada uno y upsert false. Su descarga exacta precede al retiro. Ante respuesta perdida de una subida, sólo la descarga de bytes iguales permite continuar; nunca se reemplaza el objeto.

downloadTelemetryMaintenanceArchive recupera los tres objetos con hash de manifiesto y proyecto custodiados, sin un manifiesto o selección local. Primero comprueba el hash; después liga la selección privada y verifica el gzip con el codec. No es backup global ni protección independiente ante pérdida de acceso a Supabase; el operador conserva esos hashes fuera del contenedor.

REST sólo permite cuatro metadatos GET, dos RPC POST con cuerpos definidos y las rutas exactas de los objetos. Pin de origen, sin redirects ni DELETE directo. Timeout 15 s por request y señal global del run. La función de retiro y los POST de Storage no se repiten con el mismo cuerpo; el selector read-only puede repetirse para tomar el lote siguiente. El timeout cliente no acredita que SQL haya sido cancelado.

Pruebas: node --test scripts/lib/telemetry-maintenance-network.test.mjs; 9/9 aprobadas. Los fixtures verifican rutas, métodos, datos corruptos, scopes, recuperación sin archivos locales y prevención de retry, con excepción explícita del selector. CLI simulado completa cuatro lotes usando cuatro SELECT idénticos y preserva doce objetos. La custodia y el retiro REST/Storage reales siguen pendientes; la inspección GET real de CLI está documentada en README.md.

Rollback: retirar módulo/test junto con su import de CLI; respaldos de pilotos anteriores permanecen. No hay creación de bucket, permisos públicos ni borrado automático de archivos. El límite de 5 MiB/run se complementa con 50 MiB de contenedor en SQL; no representa cuota de cuenta certificada.
