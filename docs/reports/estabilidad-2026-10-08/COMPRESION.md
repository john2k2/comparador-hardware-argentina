# Selección de respaldo comprimida y recuperable

Los lotes nuevos guardan `selection.json.gz` mediante gzip9 y `application/gzip`. Conservan el JSON canónico en memoria, su `selectionSha256` y el manifiesto v1. El presupuesto suma los bytes del payload gzip, manifiesto y selección gzip, sin confundirlos con ahorro de PostgreSQL.

El escritor vuelve a descargar bytes comprimidos exactos, descomprime hasta 1 MiB, compara el JSON original y su hash antes de permitir el retiro. La recuperación desde el hash custodiado prefiere gzip; únicamente un 404 explícito sin datos habilita el JSON antiguo. Corrupción, hash diferente, timeout, permisos, respuestas ambiguas y expansión excesiva detienen el proceso.

El prefijo depende del mismo manifiesto, por lo que un lote antiguo puede tener ambos sidecars. Se preserva `selection.json` y se añade gzip sin upsert. El sidecar anterior no se atribuye a bytes del lote nuevo; `storedBytes` mide el plan respaldado, no el delta de facturación ni el uso global del contenedor. Recuperación admite cuatro rutas exactas sólo GET; el escritor conserva sus tres objetos y un intento POST por identidad.

No cambian SQL/RPC, las capacidades de retiro, cutoff, comparación de seis campos, ACK, conciliación, límite de cuatro lotes de 250, 120 segundos, 5 MiB por ejecución ni tope de 50 MiB del contenedor. No se creó una segunda programación ni se convirtió un fallback horario en mantenimiento diario.

## Verificación

- `node --test scripts/lib/telemetry-maintenance.test.mjs scripts/lib/telemetry-maintenance-network.test.mjs scripts/lib/telemetry-maintenance-cli.test.mjs scripts/lib/telemetry-selection-codec.test.mjs scripts/lib/telemetry-backup.test.mjs scripts/lib/telemetry-backup-storage.test.mjs scripts/lib/telemetry-backup-cli.test.mjs`: 65 pruebas aprobadas, cero fallos/omisiones. Cubren SDK instalado y transporte simulado, ambos formatos, coexistencia, presupuesto exacto y rechazo por un byte menos, pérdidas/ambigüedad, corrupción, límites y preservación de las guardias anteriores.
- Revisión independiente Sol/high: 47 pruebas propias y dos controles adicionales de gzip concatenado; el límite aplica a la salida total. Sin hallazgos materiales confirmados. Lint focal y diff check aprobados.
- Coordinador: nuevo codec Node sobre cuatro selecciones privadas reales ya custodiadas. Descompresión exacta y hash igual al manifiesto original en los cuatro casos: 211.082 bytes originales, 18.841 comprimidos. El conjunto de archivo de esta muestra pasaría de 256.303 a 64.062 bytes, 75,01% menos. Cero llamadas o escrituras remotas en el ensayo.
- Verificación integrada final: 2.064 unitarias aprobadas, dos skips preexistentes y 150 operativas aprobadas. No se repitió build web después de agregar sólo estos módulos Node de runner; el build OpenNext anterior ya incluía el estado final de búsqueda/scheduler.

Las pruebas simulan el transporte y los retiros; no demuestran ejecución de este formato en Storage productivo. La lectura de las cuatro selecciones reales acredita reversibilidad local, no una restauración remota ni reducción física de la base.

## Unidad y reversión

Archivos: núcleo de mantenimiento y su prueba, transporte y su prueba, prueba CLI, codec y su prueba, este contrato. El presupuesto de lectura/archivo y los límites de retiro permanecen acotados.

Antes de crear archivos nuevos puede revertirse toda la unidad. Después, pasar a `inspect` para detener las futuras mutaciones y conservar el lector compatible con JSON/gzip y el codec. Puede revertirse el escritor, pero **el lector anterior de `6b91cfc` busca sólo `selection.json` y no recupera los lotes nuevos de tres objetos**. No duplicar sidecars remotos para maquillar esa incompatibilidad ni borrar respaldos durante la reversión.
