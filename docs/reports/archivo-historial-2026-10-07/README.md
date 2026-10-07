# Piloto privado de historial en Supabase Storage — 07/10/2026

**Piloto completado: 759 observaciones del 05/07, 18 tiendas, ocho columnas completas; copia privada descargada y restaurada en PostgreSQL 17 aislado.** Jonathan confirmó Storage para esta prueba pequeña, manteniendo costo cero. No se retiraron originales ni cambió el sitio, el scheduler o el plan.

## Resultado comprobado

| Medida | Resultado |
|---|---:|
| Observaciones / tiendas | 759 / 18 |
| Objetos remotos | 18 gzip + 1 manifiesto |
| NDJSON descomprimido | 197.772 bytes |
| Payload gzip | 38.274 bytes |
| Manifiesto | 52.390 bytes |
| Total real en Storage | 90.664 bytes |
| Reducción de payload / conjunto con manifiesto | 80,65% / 54,16% |
| Lectura de un producto comprobado | 1 de 18 chunks |
| Originales en la base al corte 19:45 UTC | 759, historial 176.644.096 bytes |
| Base al corte 19:45 UTC | 930.516.115 bytes; sin recuperación física |

El 93,4% de la primera prueba era otra muestra parcial sin identificador primario; no se traslada a esta entrega completa. El manifiesto pesa más que los gzip del piloto: para ampliar, hay que medir particiones/índice y evitar muchos objetos pequeños. Estos porcentajes tampoco se extrapolan al catálogo, sus índices o el historial completo.

Contenedor privado `catalog-history-archive`, creado a las 19:40:27 UTC, máximo 1 MiB por archivo, MIME gzip/JSON. Entrega inmutable identificada por SHA-256 del manifiesto `52998f35183f27acfbd76dd6e5b74803b50f954eae276905c603217768c46995`. El límite local del piloto es 5 MiB; el total observado usa alrededor del 0,01% del GB gratuito de archivos, sin reservar esa cuota para el historial futuro. [Cuotas de Supabase](https://supabase.com/pricing).

## Pruebas y revisión

- 23 casos nuevos de comportamiento: precisión/UTC/null/CSV, páginas y corte fijo, hashes/conteos/esquema/corrupción, límites de descompresión, selección parcial, privacidad declarada/repetición y tamaño antes de ArrayBuffer. Suite operativa completa: 64 aprobados.
- Segundo contraste de sólo lectura contra las 759 IDs originales: cuatro respuestas CSV conservadas; ocho columnas coinciden directamente con el archivo. Revisor reprodujo la comparación offline y verificó el hash.
- Recuperación real desde Storage de los 19 objetos; cotejo byte a byte y validación completa de las 759 filas antes de usarlas.
- Restauración de la copia descargada en cluster PG17.11 propio, sin credenciales ni URLs remotas. Seis grupos aprobados: faltantes/corruptos, rollback de interrupción, ocho campos/FK, repetición sin duplicados, límites de dinero/microsegundos/null/texto escapado y lectura selectiva/sentinelas.
- HTTP público 400 `Bucket not found`; solicitud con clave anónima y sin clave de servicio 400 `Object not found`. RLS activo, cero políticas Storage; roles anon/authenticated sin bypass ni superusuario. No se añadieron políticas.
- Revisión independiente Sol/high cerró los hallazgos del corte fijo, día solicitado y tamaño de Blob; también comprobó tres fallos ambiguos con Storage simulado.

La primera subida se detuvo por fallo de lectura de control; el diagnóstico original no conservó una causa específica. Metadatos mostraron tres objetos y una lectura posterior válida. Reanudar conservó esos tres, agregó los dieciséis faltantes y verificó toda la entrega. No atribuir el fallo a un proveedor o causa no demostrados.

## Herramientas y límites

[Codec](CODEC.md), [exportación](EXPORT.md), [Storage](STORAGE.md) y [recibo agregado](recibo.json). Los datos/CSV/configuración privada quedan bajo `tmp/` o fuera de Git. El código se conserva en la rama local `codex/archivo-historial-storage`; la web publicada no incorpora este piloto ni hay ejecución periódica nueva.

`readRemoteHistoryArchive` recupera una entrega usando un manifiesto confiable y su hash, verifica todos los archivos y permite restaurarla sin depender de los datos originales. Los hashes no sustituyen autenticidad del manifiesto. `snapshotAt` es un ancla del piloto (19:16 UTC); la exportación terminó a las 19:34 UTC y el contraste original a las 19:39 UTC, sin snapshot transaccional. La restauración usa referencias mínimas de productos/tiendas para satisfacer FK; no es una recuperación de todo el proyecto.

El SDK acumula el cuerpo antes de producir el Blob; el chequeo previo a ArrayBuffer y el límite de archivos no prueban un límite anterior de transferencia. No se exportó información de usuarios. No hubo migración, índices, mantenimiento, borrado, cambio de plan ni refresh. La política 14/90/365 y frescura real siguen vigentes.

## Siguiente decisión de capacidad

Dimensionar datos/índices activos, metadatos y volumen de archivo real con margen, preservando historial reciente y “Bajaron de precio”. Preparar un inventario completo y recuperación repetible antes de proponer retiro de originales. El código está acotado a 1.000 filas: no usarlo como barrido completo ni cambiar su límite sin una entrega revisada.

El hipotético descuento de caché e historial completos dejaba 508,2 MB antes de conservar historia reciente; este piloto demuestra la vía de respaldo, no operación sostenible dentro de 500 MB. Dirección mantiene objetivo operativo propuesto de 450 MB, presupuesto cero y las tres entregas del plan.

## Rollback y unidades revisables

Cuatro unidades locales: codec; adaptador privado; exportador/CLI; verificación original y recuperación PG/documentación. El codec suma 436 líneas, 36 sobre la referencia orientativa: se registra sin quitar pruebas/documentación ni abrir un PR en esta entrega.

Retirar los programas revierte el piloto local y no modifica web, base o objetos privados. Conservar manifiesto/recibos y copias recuperadas mientras se decide capacidad. Cualquier retiro de datos o eliminación de copias requiere su inventario, operación y evidencia propios; no es una consecuencia automática de esta prueba.
