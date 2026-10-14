# Catálogo completo local, asociaciones y prueba gratuita — 11/10/2026

Se trabajó en `codex/busqueda-funcional`, copia `correcciones-auditoria-web`. No se publicó la página, modificó Supabase, contrató un plan ni envió código a GitHub. El Worker privado ya existente recibió deltas de su muestra.

## Resultado medido

| Alcance | Resultado |
|---|---|
| Copia completa del catálogo público | 59.692 productos, 73.827 ofertas, 34 tiendas |
| Integridad después de los cambios | `quick_check=ok`; cero errores de claves foráneas |
| Fuente compartida de CompraGamer | 1.752 registros, 1.708 publicaciones mapeadas, tres solicitudes iniciales |
| Renovación real local | 357 ofertas distintas, 15 lotes, 45 solicitudes HTTP, todas comparables en el corte |
| Asociaciones reparadas en copia completa | Cuatro; fechas, precio y stock conservados durante el movimiento |
| Asociaciones reparadas en piloto | Una; retiro del precio de Katech asignado al Ryzen equivocado |
| Búsqueda completa local | 14/14 casos iguales entre proyección y cálculo original, diez familias |
| Búsqueda remota | 48/48 antes del siguiente tick y 6/6 después, incluyendo filtros Katech/Dinobyte/CompraGamer |

El snapshot contiene cuatro tablas públicas, no toda la base de Supabase: no incluye cuentas, favoritos, alertas ni historial completo. La captura inicial no fue una transacción atómica remota. Copiar todas sus filas no acredita frescura.

La lectura de CompraGamer encontró 357 ofertas con atributos exactos, 2.304 pendientes de demostrar variante, 48 conflictos de identidad y 28 de categoría. Otras 2.760 ofertas conocidas no aparecieron en la captura. No se marcaron como agotadas ni se les cambió la fecha. Las 1.708 publicaciones de diez familias quedan en una tabla privada; sólo las ofertas con prueba entran en comparación.

Las 357 observaciones reales ocurrieron entre 15:40:42 y 15:53:27 UTC. Recibos en `outputs/base-completa-mac-2026-10-11/bulk-refresh-summary.json`. La herramienta repetible está en `scripts/pilots/cloudflare-catalog/SHARED_CATALOG.md`.

## Reparaciones comprobadas

- Katech RTX 5080 Gigabyte Gaming OC 16GB estaba asignada a RX 9070.
- FullH4rd publicación 29711, RTX 5080 Gigabyte Gaming OC 16GB, estaba asignada a RX 9070.
- Katech Ryzen 5 7600 estaba asignado a Ryzen 7 7700. Ambos destinos ya existían en la muestra y se sincronizó su reparación.
- FullH4rd publicación 30054, RTX 5070 Ti MSI Shadow 3X OC 16GB, estaba asignada a MSI Ventus.

Los planes verifican título, URL, hash, variante y destino existente. Retiran las bases de precio de la oferta movida y reconstruyen ambos productos. No trasladan una observación vieja como precio recién obtenido. Se conservaron pausas de seis horas e intentos anteriores.

Recibos: `outputs/asociaciones-lectores-2026-10-11/full-association-receipt.json`, `full-association-fourth.json`, `pilot-association-receipt.json`, `pilot-sync-receipt.json`. La auditoría durable está en `pilot_association_audit` de la copia completa.

## FullH4rd: acceso y límite actual

Se usó REA con navegador lanzado, primero headless y luego visible. Los dos cortes recibieron redirección y 403 de Cloudflare. IDs de evidencia: `ev_3b8b087b3dec9c7a3469814d32a3137b18f76967dcedac66e29ebe6c9add7383` y `ev_07b2b44a2e3e6ee98b3945c51ee59777060a41572dc19f5f7050f1875efd788e`.

Chrome normal pudo abrir la grilla y las fichas públicas después de su verificación automática. `/productos` anuncia 1.897 resultados, doce por página; eso exigiría hasta 159 páginas. No se capturaron esas 159 páginas y no se acreditó un API completo. Se inspeccionaron los scripts públicos ya cargados; una petición HTTP directa al script volvió a recibir 403.

El lector ahora reconoce `.results-card`, conserva centavos y sigue paginación declarada. Comprar no prueba stock. En Chrome, 29711 mostró $3.008.115 y sin stock web/local; 30054 mostró $2.357.890,01 y stock alto. Estos cortes se usaron para identidad, no se inyectaron como refresh automático. Los archivos `*-dom-excerpt.html` son subconjuntos transcritos del DOM, no respuestas HTTP íntegras.

Se confirmó también el contrato POST `/_func/search.php` con parámetro `search` en el script inline público. Una petición normal desde la Mac para `rtx` recibió 403, sin cookies ni reintentos; recibo `outputs/fullh4rd-rea-2026-10-11/public-suggestion-receipt.json`.

Los bloqueos automáticos siguen pendientes. Se requiere una fuente pública estructurada utilizable o un flujo de captura de navegador medido y reproducible. Cambiar selectores por sí solo no elimina el 403.

## Cloudflare y automatización

Los dos ticks manuales posteriores a la reparación obtuvieron ofertas de MaxTecno, Gaming City y CompraGamer; la GPU CompraGamer RX 9060 XT quedó en $999.990. Al reactivar el LaunchAgent, otro tick observó Dinobyte con stock desconocido/reserva; no la convirtió en comparable. Un 404 y una ficha sin precio conservaron ausencia de observación.

El scheduler conserva el inicio, los límites y el vencimiento original del 12/10/2026 15:03:10 UTC. Ejecuta cada quince minutos: hasta 200 intentos, 400 solicitudes de fuentes y 20.000 escrituras remotas por día. La reserva conservadora de 4.000 escrituras tras recuperación sigue retenida: evita subestimar una respuesta perdida, aunque reduce capacidad disponible.

La base completa permanece en la Mac; D1 conserva 1.012 productos y 1.366 ofertas de la muestra. No se importó el SQL completo: el bootstrap local necesitó 369.227 escrituras de filas y una proyección grande; subirlo de una vez superaría el límite diario gratuito.

En 48 consultas remotas se midieron 72.504 lecturas D1: 16 misses sumaron 72.472; 32 hits sumaron 32. La mediana de red desde la Mac fue 1.032 ms en miss y 171 ms en hit. El peor miss leyó 12.149 filas. Esto no mide CPU.

Analytics a las 15:59:32 UTC: 332.031 lecturas y 23.490 escrituras D1 acumuladas del día; 235 solicitudes Worker, cero errores; CPU p50 1,214 ms y p99 9,257 ms. Ese corte incorpora 72.635 lecturas y 112 escrituras respecto del corte previo a la reparación, pero todavía no el último tick de 26 escrituras; los recibos directos deben conservarse junto a Analytics por su demora de incorporación.

Cuota oficial gratuita: cinco millones de filas leídas y cien mil escritas por día, compartida entre bases de la cuenta. Fuente: https://developers.cloudflare.com/d1/platform/pricing/ . El CPU gratuito tiene poco margen cerca de diez milisegundos: https://developers.cloudflare.com/workers/platform/limits/ . La muestra no acredita consumo ni estabilidad del catálogo completo.

El despliegue público siguió en `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977`, 100%; fecha de modificación y etag idénticos al corte inicial. Comprobación en `outputs/ciclo-automatico-mac-2026-10-11/asociaciones-cierre.json`.

Se confirmó también la generación remota después del tick del scheduler. Seis solicitudes adicionales consumieron 3.008 lecturas y verificaron que la oferta mal asignada no aparece bajo Ryzen 7700. Recibo: `outputs/asociaciones-lectores-2026-10-11/post-scheduler-check.json`. Los cuatro deltas de esta tanda acumulan 138 escrituras, incluidas las 26 posteriores al corte de Analytics.

## Verificación y próximos límites

Pasaron 92 pruebas Node del consumidor, asociaciones, selección, cola, ciclo y transporte; 52 Vitest de los lectores; TypeScript y ESLint de los archivos cambiados. El adaptador se probó con mover → observar de nuevo → buscar filtrando Katech. El transporte se probó con ambos destinos y retiro atómico de la base anterior.

Reversión por unidad: lectores pueden restaurarse y recompilar el bundle; asociación local requiere detener consumidores y restaurar el checkpoint anterior completo; delta remoto exige marcador esperado y batch de ambos destinos; staging/renovación compartida se retiran sin tocar Supabase. Ninguna reversión de código cambia automáticamente precios ya observados.

Prioridad siguiente: resolver las variantes y duplicados del catálogo, recuperar publicaciones 404 con reemplazo demostrado y disponer de una fuente reproducible para FullH4rd. Después, reducir lecturas y probar cobertura completa remota antes de conectar la página. Las otras familias todavía no tienen prueba suficiente para renovación comparable automática. Una Mac encendida amplía captura, pero no corrige por sí sola identidad, stock ni la cuota D1.

## Unidades locales de revisión

- Lectores: `c123a60`; 275 líneas de cambios, pruebas y documento de reversión.
- Núcleo de reparación: `ff6f19e`; 393 líneas, pruebas y contrato.
- Captura compartida: `c5f95cb`; 279 líneas; selección, cola, consumidor y CLI forman una unidad independiente.
- Adaptador y transporte: el commit de este informe agrega callbacks reales, pruebas de búsqueda y ambos destinos del delta. No se envía ninguno a GitHub.
