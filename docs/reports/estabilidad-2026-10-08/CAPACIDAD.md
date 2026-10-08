# Capacidad gratuita: archivo más pequeño y deuda física abierta

Jonathan mantiene costo cero y acepta limitar alcance. La recomendación conserva Supabase para datos activos y su Storage privado para el archivo. Una reescritura completa o un cambio de proveedor agrega trabajo de migración sin definir qué ofertas podemos mantener fiables. El objetivo operativo propuesto sigue siendo una base de hasta 450 MB con margen; no es una cuota oficial ni un resultado conseguido.

## Lectura comprobada

La consulta de sólo lectura de 08/10, 14:51:27 UTC, midió 937.258.131 bytes de base. Son tamaños asignados de tablas e índices, no una estimación de cuánto se liberará al retirar filas.

| Relación | Total MB decimales | Índices MB |
|---|---:|---:|
| Caché y eventos | 245,56 | 78,05 |
| Productos | 237,91 | 164,27 |
| Historial de precios | 178,08 | 134,39 |
| Resúmenes de precio | 119,32 | 50,96 |
| Ofertas actuales | 103,48 | 63,05 |

Hay 342.853 eventos operativos vencidos. El último día escribió 524 eventos de tienda y cero de endpoint; ese cero no prueba ausencia de errores. Los eventos vencidos continúan como filas vivas de PostgreSQL: caducidad lógica y espacio recuperado son cosas distintas. Las estimaciones del sistema de 15:31 UTC no son conteos exactos ni un cálculo de bloat.

El primer mantenimiento natural comprobado retiró 1.000 eventos después de verificar su archivo completo. El máximo actual de 1.000 por día daría un piso de 343 días para el atraso actual incluso sin nuevas llegadas; no es una fecha de terminación. Es un límite para frenar acumulación, insuficiente para drenar pronto el atraso.

El descuento hipotético de **toda** caché e historial deja 513.625.235 bytes. No es una base compactada, no conserva los datos requeridos y no es un ahorro prometido. Productos, resúmenes y ofertas actuales ya suman 460.718.080 bytes asignados, antes de otras estructuras. Por eso el objetivo de 450 MB requiere medir compactación y definir un catálogo activo sostenible, además de archivar eventos.

## Mejora del archivo

El payload de eventos ya estaba comprimido. La selección de sus metadatos seguía siendo JSON sin compresión. En los cuatro lotes reales del primer diario, los metadatos pasaron de 211.082 a 18.841 bytes mediante gzip9, con descompresión idéntica a los originales: 91,07% menos para esa parte. El archivo completo de esos lotes pasaría de 256.303 a 64.062 bytes, una reducción del 75,01% en esta muestra.

La candidata implementa `selection.json.gz`, con tipo `application/gzip`, hash sobre el JSON canónico y descarga/descompresión comprobada antes del retiro. El lector conserva el formato anterior `selection.json`; corrupción, ambigüedad y timeout no justifican intentar el formato antiguo. El manifiesto y su hash de custodia conservan su contrato. Los respaldos anteriores permanecen intactos. [Contrato, pruebas y reversión](COMPRESION.md).

Esto reduce Storage y tráfico del respaldo. No cambia el tamaño físico de PostgreSQL, el número diario de retiros, la cuota, las políticas ni el límite de 50 MiB del contenedor. Extrapolar la muestra a todo el atraso daría unos 22 MB, pero el tamaño real depende de las filas pendientes; sólo los archivos construidos/verificados permiten acreditar su presupuesto.

Después de crear un respaldo nuevo, el lector anterior no puede recuperarlo porque busca sólo `selection.json`. Ante una reversión, pasar a `inspect` y conservar el lector dual y su codec, incluso si se restaura el escritor anterior. Revertir todo el commit sin conservar ese lector dejaría incompatible la herramienta anterior; los objetos comprimidos no se pierden, pero necesitan el lector correspondiente.

## Orden de ejecución recomendado

1. Publicar las correcciones de esta entrega y observar el siguiente diario natural con los mismos límites: cuatro lotes de 250, 120 segundos y 5 MiB por ejecución. Comparar los bytes comprimidos del recibo con los objetos realmente descargados. Mantener los respaldos ya custodiados.
2. Preparar una operación separada para drenar el atraso por etapas, con conjunto/cutoff fijos, presupuesto global, hashes, stop ante ACK incierto y conciliación. El archivo nuevo no autoriza más retiros, más cron ni ejecuciones manuales. Una etapa debe demostrar cantidad retirada y tiempo antes de ampliar.
3. Medir el espacio reutilizable y el necesario para compactar. Ensayar en PostgreSQL aislado con datos y contratos representativos; comparar búsqueda, historial/carry-forward y concurrencia. Una operación física requiere una ventana y una reversión concretas: `VACUUM FULL` bloquea la tabla y requiere recursos temporales. No ejecutar mantenimiento a ciegas sobre una base saturada.
4. Si lo compactado no deja margen, preservar guías, muestra G02, favoritos, alertas y modelos con ofertas mantenibles; archivar catálogo histórico fuera del conjunto activo. La muestra y los denominadores se siguen midiendo completos: restringir alcance no convierte falta de cobertura en éxito. Historial e índices requieren equivalencia del contrato, no un corte arbitrario de edad o `idx_scan` bajo.

La siguiente unidad de capacidad debe devolver una candidata con bytes medidos y una operación acotada revisable. No se instaló SQL ni se preparó una autorización ilimitada de limpieza. El catálogo general tiene sólo 7.660/34.550 componentes observados en 24 horas al corte público de esta sesión; ampliar el inventario ahora aumenta la deuda de observación.

Fuente primaria: [Supabase sobre tamaño de base y VACUUM](https://supabase.com/docs/guides/platform/database-size). La cuota documentada y el espacio físico se distinguen del peso de JSON o de filas borradas. El estudio de esta entrega conservó cero escrituras remotas.
