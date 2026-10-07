# Capacidad: primera unidad ejecutable con costo cero

**El archivo de historial no basta para cerrar capacidad. La siguiente unidad es retención acotada de telemetría vencida, preservando ofertas y funciones de usuario.** Lecturas del 07/10/2026, 20:08–20:18 UTC, proyecto zyiyziubpcpgoqlkcrie; rama local codex/capacidad-costo-cero desde e3920df. Jonathan autorizó empezar el dimensionamiento y preparación tras el piloto Storage. No se retiraron datos ni se amplió el piloto de 1.000 filas.

## Medición vigente

| Tabla / función | Datos y otros espacios MB | Índices MB | Total MB |
|---|---:|---:|---:|
| api_cache_entries | 167,5 | 77,9 | 245,4 |
| products | 73,6 | 162,7 | 236,3 |
| price_history | 43,1 | 133,6 | 176,6 |
| catalog_price_summaries | 68,3 | 50,1 | 118,3 |
| product_prices | 38,9 | 62,6 | 101,4 |

Base: **930.516.115 bytes**, MB decimales. Ocho tablas principales suman 501.235.712 bytes de índices; esos índices no son espacio gratuito: varios sostienen búsqueda, identidad, cobertura y ordenación. El contador de lecturas no decide su retiro. Una copia equivalente de updated_at ocupa sólo 1.400.832 bytes, ya identificada en la entrega anterior: no resuelve capacidad. No se repite esa auditoría ni se retira el helper de historial por su contador.

Cuenta Free confirmada. Presupuesto conservador de planificación: 500.000.000 B nominales y objetivo operativo propuesto 450.000.000 B. Incluso descontando el 100% físico de **ambas tablas completas**, caché e historial, quedarían **508.423.315 B**. Faltarían 8.423.315 B hasta el nominal o 58.423.315 B hasta el objetivo, antes de conservar datos activos y recientes. Es un techo hipotético de contribución, no ahorro realizable. El descuento parcial real y el costo de índices/archivos deben medirse; no multiplicar porcentaje de filas por tamaño físico.

[Medición agregada](medicion.json) conserva cortes, filas y supuestos. pg_database_size mide la base, no todo el volumen ni WAL. default_transaction_read_only=off no certifica cuota suficiente. Los informes de cuota/consumo de la organización no se verificaron en esta unidad. [Cuota y tamaño](https://supabase.com/docs/guides/platform/database-size), [plan gratuito](https://supabase.com/pricing).

## Qué se puede preparar sin perder utilidad

La caché conserva 347.458 filas: 345.779 vencidas y 1.679 activas al corte fijo 20:10 UTC. Dos scopes de telemetría aportan **343.489 vencidas**: operational-store-event 329.414 y operational-endpoint-event 14.075. Son eventos distintos, no duplicados demostrados. La primera categoría creó 664 filas en las últimas 24 horas y 3.937 en siete días.

El TTL de eventos es 48 h; paneles leen sólo no vencidos y hasta 1.500/1.000. Esos límites afectan lectura/memoria. getSharedCache posee borrado lazy protegido, pero las consultas de eventos filtran expires_at>now y no revisitan sus claves únicas. El vencimiento lógico conserva las filas en la base. [Consumidores y ventanas](CONTRATOS.md).

Preparación local: helper con dry-run por defecto, máximo 250 metadatos, sólo esos dos scopes, expires_at<corte y updated_at<=corte. Un retiro futuro exige identificador de autorización, vuelve a comparar clave/scope/fechas literales y contabiliza sólo confirmaciones exactas. Una renovación conserva la fila; errores o confirmaciones ambiguas detienen la ejecución. El identificador documenta la aprobación humana: no la sustituye ni es un mecanismo de autenticación.

El comando de inspección es exclusivamente de lectura: su transporte rechaza cualquier método distinto de GET y cualquier ruta fuera de api_cache_entries del proyecto fijado. No acepta modo apply ni corte libre. La evidencia local conserva sólo metadatos, con permisos privados. El resultado de 250 filas no demuestra cobertura completa, bytes recuperables ni mantenimiento periódico instalado.

**Inspección real completada a las 20:26:38 UTC:** 250 candidatos, 149 de endpoint y 101 de tienda; cero retirados, transporte GET-only. Recibo privado de cuatro metadatos, 64.463 bytes, SHA-256 6ea472faaef5fc7ae673e9ba0c3a83a1efb76b951e823e68155c1a162e991752. Ese recibo permite identificar el lote; no contiene payloads ni prueba restauración después de un commit. [Verificación y alcance](verificacion.json).

**Verificación final 20:33:08 UTC:** guard reforzado rechaza redirecciones, además de métodos mutantes/rutas/orígenes. La nueva lectura conserva 250 candidatos (149/101) y cero retirados; recibo 64.492 B, SHA-256 28200f5820003ab6634f2acd09ac0322a61395bfb5d3175d230b271b99aee009. Doce pruebas nuevas aprobadas. Suite habitual final: 76/76, sin skips, 2.211 ms. Revisión independiente Sol/high cerró el límite de redirects y aprobó el helper y la corrección de fixture.

Los intentos anteriores se conservan: habitual 70/73; dos archivos aislados 18/18; serial 73/73; después del guard 75/76 serial. El test de muestra generaba timestamps durante la respuesta, después del corte congelado del reporte. Se fijó la observación antes del CLI y se demoró la respuesta 1.250 ms para reproducir la frontera; conserva todas las afirmaciones y da 15 s sólo a esa prueba con compilación. Producción/contadores/frescura no cambiaron. Los otros fallos iniciales de arranque/timeout sugieren sensibilidad al host; un pase final no acredita estabilidad bajo cualquier carga.

## Historial: conservar el contrato antes de retirar originales

248.876 observaciones: 36.771 recientes de hasta 14 días; 61.491 entre 14–90; 150.614 entre 90–365; cero de más de un año al corte. El corte anterior del piloto, 09/07 a las 00:00 UTC, incluye **149.514 filas**: difiere de la franja de 90 días calculada a las 20:10. Son conteos de edad, no de redundancia. 193.751 offer_url son NULL: conservar ese valor y su identidad.

“Bajaron de precio” lee 24 h y necesita precio anterior de la misma oferta. La búsqueda, comparación y guías usan catálogo y ofertas actuales. Existe hardware_price_index real, aunque no se encontró recorrido activo: calcula días de Buenos Aires y arrastra cotizaciones anteriores al inicio. Archivar y quitar todo lo anterior a 90 días cambia potencialmente ese resultado. La función real cleanup_price_history sigue 14/90/365 con date_trunc de sesión UTC; compactar último de día UTC no conserva necesariamente último de día Buenos Aires. No ejecutar esa RPC como solución global.

Antes del archivo completo: definir y comprobar equivalencia de esas series, elegir particiones/índice más compactos, exportar por lotes con inventario reconciliado y recuperar cada entrega. El codec y sus límites siguen intactos. El piloto privado conserva 759 originales y 90.664 bytes en Storage. No constituye backup del catálogo completo ni autorización para retirarlos.

## Orden de ejecución y condiciones de cierre

1. Retención de telemetría: cerrar inspección/pruebas/revisión; preparar el lote concreto y su respaldo/recuperación antes de solicitar un retiro. Mantener 48 h activas. Luego incorporar mantenimiento a la programación existente, evitando otro scheduler. No está publicado ni activado en esta unidad.
2. Recuperación física y datos activos: obtener una prueba acotada de espacio reutilizable/compactable y del margen de volumen, locks y ventana antes de mantenimiento. Medir después; no confundir DELETE con reducción del archivo. Conservar resúmenes y sus índices mientras sostengan contratos. Eliminar funciones visibles para recuperar 5,9 MB no cierra la brecha.
3. Archivo de historial: después de equivalencia y dimensionamiento completo, proponer traslado y retiro por entrega verificada. Si el conjunto activo con margen no entra en 450 MB, elegir un catálogo operativo menor antes de prometer crecimiento sostenible a costo cero. No cambiar cobertura ni denominadores para cerrar el objetivo.

La consulta mensual con anchos y la de valores de tres tablas se cancelaron a los 3 s (57014). No se repiten ni se amplía timeout; sus resultados son desconocidos. El conteo simple por franjas sí terminó. No hay medida nueva de bloat ni ahorro físico; las estadísticas de anchos son estimaciones del planificador. Metadatos, SQL exactos y fallos quedan en tmp/capacidad-2026-10-07, fuera de Git.

No hubo DELETE remoto, RPC mutante, migración, RLS, VACUUM, índices, refresh, cambio de cuenta/plan, publicación ni nueva programación. PostgreSQL remoto 17.6, local de restauración anterior 17.11; no se simula capacidad idéntica entre entornos. La versión se conserva como contexto, sin programar una actualización durante este trabajo. [Recuperación física y sus locks](https://www.postgresql.org/docs/17/routine-vacuuming.html#VACUUM-FOR-SPACE-RECOVERY).
