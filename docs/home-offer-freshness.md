# Evidencia de precios en portada

Destacados y bajadas usan la observación real de una oferta comparable, con stock explícito y ventana de 24 h. Actualizar la ficha o leer el caché no rejuvenece su precio. Las selecciones primarias verifican caducidad al leer el caché; productos de respaldo conservan el indicador de fallback.

Validación: un precio viejo, unknown o sin fecha no se convierte en destacado/bajada por tener un producto actualizado. Rollback: restaurar sólo consumidores/cache key de portada; conservar oferta y timestamp real. Esta unidad no cambia la selección editorial de guías ni los controles SEO pendientes.

---

## Unidad 14/10/2026 UTC: selección observada y recuperación parcial

Estado: corrección local sobre `5d9baa16a6e433143c40e2678f6f3744fc932a88`, integrada por el coordinador antes de esta unidad. No publicada; no comprobada en producción. Implementación y pruebas del 14/10/2026 UTC, 13/10 en Santiago.

## Evidencia y causa

La revisión `outputs/revision-integral-2026-10-13/` de la copia principal conserva:

- `db-snapshot.json`: snapshot público con `collected_at=2026-10-14T00:12:36.103Z`.
- `home-observed.json`: respuesta 503 sin motivo distinguible.
- `guide-failed-run.json`: ejecución GitHub `38494581758`; refresh falló a las 01:14:45 UTC y el paso de guardado de portada fue omitido. La muestra del encargo registra RAM con un intento y cero observaciones comparables.

Al corte 02:10:55 UTC la selección tenía 118 minutos. El lector debe rechazarla: la ventana de 75 minutos sigue vigente. El fallo causal localizado está en la guarda `success()` del workflow: el resultado de una pieza de guías bloqueaba reconstruir la portada a partir de ofertas válidas ya almacenadas. La vigencia individual de esas ofertas es independiente del éxito global del refresh.

## Cambio acotado

`.github/workflows/catalog-refresh.yml` permite ejecutar el guardado tras un paso refresh ejecutado con resultado `success` o `failure`, sólo para `guides` o `priority`. Excluye cancelación, paso omitido y diferimiento explícito. Conserva el fallo original del job y todos los horarios/límites. El guardado vuelve a leer la selección por los lectores existentes; no inicia observaciones contra tiendas. Un error de lectura o escritura sigue siendo error, y una selección verdaderamente vacía conserva su semántica.

`src/lib/home/edge-read.ts` agrega `reason` al 503, manteniendo `error`, estado y cabeceras. Los códigos acotados son `snapshot-expired`, `snapshot-missing`, `snapshot-invalid`, `response-invalid` y `selection-unavailable`. No devuelve errores internos, filas privadas, configuración ni credenciales.

`ObservedHomeSections.tsx` conserva únicamente el último snapshot recibido en memoria de esa página después de un fallo de lectura. Lo revalida con el mismo decoder: corte de hasta 75 minutos, últimas ofertas de hasta tres horas, stock e identidad. No cambia `collectedAt` ni `lastUpdated`, no añade otra fuente ni persistencia. Muestra una frase simple del fallo y la acción de comprobar condiciones. Si el corte vence, se retira.

`src/lib/seo/home-copy.ts` deriva `slug`, presupuesto, CPU y GPU de `BUDGET_GUIDES`, preservando el shape `slug/title/target`. La tarjeta de dos millones queda alineada con Ryzen 7 5700 y RX 9060 XT 16GB. Es descripción editorial, no acreditación de siete ofertas vigentes ni promesa de disponibilidad.

## Verificación local

Antes de implementar: 26 pruebas, seis fallos reproducidos y 20 aprobadas. Los fallos incluyen la guarda real del workflow para outcome `failure`, falta de diagnóstico del corte de 118 minutos y copy fijo desalineado.

Después: 53/53 pruebas en ocho archivos, y ESLint focal aprobado. Comando:

```sh
npx vitest run src/lib/home src/lib/seo/home-copy.test.ts src/components/home/PriceDropSection.test.ts src/components/home/PopularProductsSection.test.ts
```

Las pruebas evalúan la expresión real del workflow con contextos simulados; verifican failure, success, skipped, deferred, cancelación y modos excluidos. El recorrido runtime con fixtures pasa productor → upsert simulado → lector público con `Response` real y conserva fecha/precio. Los casos negativos cubren 118 minutos, 75 minutos exactos y un milisegundo extra, ofertas vencidas, stock desconocido y contradicción de identidad. Ninguna prueba consulta cuentas, tiendas ni servicios remotos.

Límites: no se ejecutó GitHub Actions, build ni navegador de esta unidad, ni se comprobó guardado remoto. Vite/Node emiten advertencias preexistentes de config nativa/deprecación, sin fallos de suite. La derivación editorial se importa en un componente cliente mediante el módulo existente: el build coordinado debe revisar tamaño y disposición de las tarjetas con nombres más largos.

## Cierre y siguiente acción del coordinador

Esta unidad cierra la causa local del paso omitido y el diagnóstico del lector. El coordinador debe revisar el diff, ejecutar tipos/build y comprobar escritorio/móvil con fixtures. La recuperación productiva requiere una publicación autorizada y evidencia posterior de una ejecución natural: incluso con fallo parcial de guías, el paso home debe ejecutarse y guardar un corte nuevo con fechas reales, seguido de API y UI públicas coherentes. Si no hay ofertas elegibles o la lectura falla, corresponde vacío/503; no aumentar 75 minutos ni tres horas, ni despachar refresh para aparentar recuperación.
