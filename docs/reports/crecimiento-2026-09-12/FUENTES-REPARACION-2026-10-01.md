# Reparación de fuentes y categorías — 01/10/2026

Se repararon lectores de fichas y se corrigieron 922 periféricos mal clasificados. El catálogo completo todavía contiene publicaciones antiguas, fuentes bloqueadas y ofertas sin identidad comparable. La meta de observar el 95% del catálogo prioritario en 24 horas no está alcanzada.

## Cambios constatados

| Fuente | Reparación y criterio |
|---|---|
| Mexx | Contrasta nombre/URL de microdatos, moneda ARS y precio visible con impuestos. Stock positivo requiere texto visible «EN STOCK». |
| XT-PC | Identifica el mismo ID aunque cambie el slug. Usa precio especial y stock web visibles; descarta precio/stock de la plantilla JSON-LD con fecha de 2020. |
| Gaming City | Exige canonical coincidente, toma precio principal con impuestos y unidades disponibles del detalle. |
| Compugarden | Contrasta ITEM_ID con COD del encabezado. Usa precio visible y disponibilidad para envío, separada del stock local. |
| MaxTecno | Reconoce el nuevo encabezado y el precio efectivo/transferencia; excluye lista, cuotas y recomendaciones. |
| LionTech | Reconoce encabezado simple de la ficha; conserva agotamiento explícito. |
| SCP | Usa la clase de stock del producto principal, excluyendo relacionados. |
| HF Tecnología / Space | Un H1 vacío de plantilla no oculta el producto principal validado. |
| Gezatek | La tienda migró a Qloud. Se reemplazó la búsqueda antigua que respondía 404 por `/buscar/?q=…`. Contrasta precio Geza, importe visible, SKU y stock explícito de cada tarjeta. |

Los lectores específicos no vuelven al JSON-LD genérico si falla la corroboración visible. No se sustituye una publicación eliminada por otra con un título parecido. Los IDs de Gezatek cambiaron con la migración; recuperar la búsqueda nueva no repara automáticamente las URLs antiguas guardadas.

## Categorías y persistencia

- Antes: 922 productos cuyo nombre empezaba con un periférico inequívoco estaban en otras categorías; 372 figuraban como procesadores, 107 como GPU y 60 como RAM.
- Después: cero coincidencias de ese conjunto siguen fuera de periféricos. Se corrigieron los prefijos de identidad cuando correspondían (919 claves), preservando IDs, precios, stock, fechas de ofertas y referencias de usuarios.
- La base rechaza nuevos periféricos como CPU/GPU/RAM mediante `catalog_primary_category` y `catalog_standalone`. El refresh también marca contradicciones de categoría como revisión de identidad.
- Se incrementó la versión de caché de búsqueda para invalidar respuestas anteriores.
- La primera ejecución detectó una restricción de persistencia que solo permitía «precio especial» a CompraGamer. La corrección permite esa condición a Mexx, XT-PC, Gaming City, Compugarden, MaxTecno y Gezatek, exclusivamente desde el rol de servicio y adaptadores contrastados. Mantiene validación de reserva, fecha, precio, stock, evidencia e historial.

## Evidencia y límites

1. **Comparación sobre las mismas fichas:** 102 URLs conocidas, tres por cada una de 34 tiendas, capturadas hasta 20:20:56 UTC. El lector anterior recuperó 37 y el corregido 59; SCP además pasó de stock desconocido a stock principal explícito en tres fichas. Esta muestra seleccionada no mide cobertura total y algunas tiendas requieren API, no HTML.
2. **Primer proceso real:** `ea402459-8e9e-4c13-832d-bf6ad066a195`, 20:39:57–20:46:14 UTC: 240 intentos, 61 observaciones guardadas, 16 comparables, 112 sin observación, 50 fallos de fuente y 17 rechazos de persistencia. Esos rechazos motivaron la reparación de condiciones de pago.
3. **Validación tras reparar persistencia:** `45a20f95-b6f1-45d6-940a-3529a2f353e4`, 20:49:34–20:51:40 UTC: 72 intentos, 27 registros inicialmente guardados, 9 inicialmente comparables, 26 sin observación y 19 fallos de fuente. **Cero fallos de persistencia.** La inspección individual posterior invalidó dos registros de plantilla: quedan **25 observaciones válidas y 7 comparables** en este corte. XT-PC guardó dos (una comparable). Son productos distintos del primer proceso: no comparar porcentajes como un experimento causal.
4. **Gezatek nuevo, lectura pública directa:** Ryzen 7600, SKU CPA009, $379.990 y stock informado; 7600X, SKU CPA026, $409.990 y stock desconocido, al 01/10 20:44 UTC. Lectura corroborada, no sustitución ni persistencia de las URLs antiguas.
5. **Pruebas:** lint, tipos, suite de unidades y 19 contratos operativos; regresiones específicas de precios/stock/ID; replay local de migraciones y pruebas SQL de categorías, condiciones de pago, permisos, reservas, historial y fechas. La CI incluye las dos nuevas regresiones SQL.

### Corrección de las fichas incompletas de Compugarden

La validación posterior al guardado detectó `§ITEMTIT§` y $1 como valores de una plantilla incompleta. Dos registros surgieron en el segundo proceso local y tres en la ejecución de GitHub `36925037999`, que ya había finalizado cuando se intentó detenerla. Se conservaron sus datos de auditoría en `FUENTES-PLANTILLAS-EXCLUIDAS-2026-10-01.json`, se excluyeron las cinco ofertas de comparaciones y se retiraron únicamente sus cinco entradas erróneas de historial generadas en estas pruebas. No había un precio anterior recuperable en el historial de esas URLs: quedaron con precio no informado, disponibilidad desconocida y fecha desconocida, sin inventar valores anteriores.

La base rechaza títulos de plantilla incluso si un runner anterior sigue ejecutándose. El constructor de productos y el refresh rechazan los mismos tokens, también en un fallback de búsqueda. La comprobación pública de las cinco URLs confirma que ya no producen una observación válida. Los resúmenes persistidos conservan las cifras originales y registran `excludedTemplateObservations` y `validObserved`, para no presentar los registros retirados como cobertura.

La comprobación positiva posterior guardó una lectura real de Compugarden del Ryzen 7600: $382.289, stock para envío informado e identidad comparable, a las 21:04:20 UTC. Usa el mismo protocolo de reserva y persistencia; no cuenta como muestra representativa de cobertura. La suite local final pasó 1.042 pruebas de unidades y 19 contratos operativos, además de las regresiones SQL. La retirada del registro inválido se probó por separado conservando un precio histórico válido anterior.

## Pendiente operativo

La evidencia incluye bloqueos 403 en FullH4rd y Hardcore, fallos de otras fuentes y publicaciones antiguas sin información suficiente. MaxTecno tiene fichas legibles desde este Mac y otras peticiones bloqueadas: no declararla completamente sana. Mexx, Gaming City y otras tiendas también conservan URLs viejas que no producen una observación válida en la cola.

La línea de base durante esta reparación fue 160 ofertas prioritarias observadas en 24h sobre 31.919 (aproximadamente 0,5%); la cola total tiene 60.781 ofertas existentes. Una frecuencia configurada no demuestra capacidad para sostener el objetivo. Durante siete días se deben medir por tienda: observaciones guardadas, disponibilidad comparable, fallos, antigüedad y avance sobre el mismo universo. Si la capacidad medida no alcanza, revisar publicaciones obsoletas y adaptadores antes de aumentar límites. Mantener las reglas de tres horas de guías/armador y el seguimiento existente.
