# Candidato de interfaz y catálogo · 05/10/2026

**Preparación del candidato completada; publicación pendiente por la búsqueda general por precio.** La ejecución estricta de TestSprite pasó 30/30 en Cloudflare. No se publicó el candidato en el dominio de producción ni se modificaron datos de ofertas.

Este corte usa la fecha local de Santiago; varias verificaciones concluyeron el 06/10 UTC. Versión fuente de aplicación: `d09a0749fa3d105264640a98467b967f7f7bd5fb`; protección del Worker: `d2b88d4`. La versión exacta y el manifiesto final se registran en `outputs/release-candidate-2026-10-05/release-summary.json`.

## Resultado concreto

- Se conservan identidad retro, colores y títulos pixel. Se compactan cabecera/menú, orden y ancho de lectura; las tarjetas comparten alturas y límites de líneas. Las fichas distribuyen imagen, nombre, precio, tiendas e información técnica sin títulos desproporcionados.
- La ficha técnica presenta atributos disponibles con etiquetas legibles y separa datos faltantes. La imagen se descarta si contradice el tipo de producto; no se inventan especificaciones o fotos.
- La búsqueda excluye por defecto referencias sin oferta actual comparable, ofrece su consulta explícita y mantiene filtros/URL/paginación coherentes. Se elimina la duplicación de categorías y se reconoce AORUS como familia de Gigabyte cuando hay evidencia textual. No se reescribieron marcas, MPN, categorías ni asociaciones persistidas.
- El índice de precios se retira de páginas, CSV, navegación, sitemap y `llms.txt`. Sus rutas devuelven 404 sin indexación; las comprobaciones públicas dejaron de exigir el 200 antiguo.
- Se unifican reporte contextual, pie, privacidad, contraste de temas y respuesta a la interacción. El menú conserva Escape y foco; movimiento reducido desactiva las animaciones pertinentes.
- Se integra la protección de escáner del checkout principal en el **entrypoint real del Worker**, conservando `scheduled`, delegación de solicitudes, contexto y exportaciones de OpenNext.
- El bloque opcional de bajas de precio ya no derriba la portada cuando falla el catálogo. Los bloques comparten una lectura por render mediante `React.cache`; no se prolonga la caché persistente ni la fecha de una oferta.

Los cambios de presentación y los de elegibilidad se entregan como una unidad amplia porque comparten tarjetas, contratos, copia y pruebas de recorridos. La protección del Worker y la evidencia de release quedan separadas. Se eligió esa excepción de tamaño después de una pasada de división; no se eliminaron pruebas ni funcionalidad para reducir artificialmente el diff.

## Verificación separada por entorno

| Control | Resultado registrado | Qué acredita |
|---|---|---|
| TestSprite, replay estricto remoto | **30 aprobadas, 0 fallos, 0 omitidas; autocorrección deshabilitada** | Los 30 scripts revisados, con viewport, historial, almacenamiento, red y movimiento reducido reales en QA sintético. |
| Suite completa sobre Workers QA | **414 aprobadas, 0 fallos/omitidas/inestables** | Recorridos, matriz visual, accesibilidad y estados; no reemplaza el catálogo real. Se conservan los cortes 413/414 y 412/414: expectativa/marcador de robots QA y selector ambiguo de cierre de sesión, corregidos y revalidados antes de repetir toda la suite. |
| Navegador con catálogo real, sobre Worker en modo de producción | **10 aprobadas** | CPU, filtro de precio, paridad tarjeta/API, apertura de ficha, selección/restauración de armador, guía móvil y retirada del índice, en escritorio y móvil. |
| Comprobación HTTP espaciada, catálogo real | **31/32; un fallo conservado** | Contratos, rango/orden/tiendas, metadatos, rutas retiradas y protecciones. La consulta general por precio devolvió 503 fría. |
| Unitarias | **1.429 aprobadas, 2 omisiones explícitas previas** | Contratos de interfaz, identidad, precios/frescura, entrada del Worker y errores. |
| Operativas | **20 aprobadas** | Programador, guardas y adaptadores operativos, incluida la composición del entrypoint. |
| SQL original en PostgreSQL 17 aislado | **13 escenarios y 2 de concurrencia aprobados** | Corrección y aislamiento con las 70 migraciones originales. No es una carga de producción. |
| Lint, TypeScript y builds OpenNext/Workers | Aprobados | Fuentes comprobadas y compilación del runtime de destino. El nuevo config/contrato QA recibió además lint y TypeScript propios. |

Las capturas usan 40 rutas × dos temas × dos anchos: 160 vistas completas y ocho estados del menú. Incluyen seis fichas sintéticas representativas; **no son fotos de cada ID del catálogo**. Los valores finales de contraste, desbordamiento, errores JS y Axe están en `release-summary.json` y en la galería. Los resultados incompletos de Axe se conservan; no se declara certificación WCAG.

## Entorno de revisión

- Catálogo real de lectura en el Worker local: `http://127.0.0.1:3105/`. Captura `outputs/release-candidate-2026-10-05/home-workers-dark-final.png`.
- QA remoto sintético: `https://hardware-ar-qa-20261005.ortiz-jonathan.workers.dev/`, versión `9994d965-2a86-4476-9bb0-ceab75611865`.
- Galería: `http://127.0.0.1:3114/temas-2026-10-05/index.html`. Las capturas anteriores están preservadas en `outputs/release-candidate-2026-10-05/previous-captures/`.
- La vista previa del usuario en 3112 sigue disponible. Su pestaña de contacto no se reutilizó para las pruebas.

QA lleva bloqueo de robots y cabecera `noindex,nofollow`, datos sintéticos, correo `example.invalid`, medición falsa, flags de refresh deshabilitados y ninguna clave de servicio/cron. No se hicieron clics afiliados, solicitudes a Google ni envíos de correo para fabricar resultados. El wrapper de QA es específico del entorno; la protección de producción se verifica por separado.

## Impedimento de publicación y siguiente prioridad

El fallo frío de `/api/search?minPrice=100000&sortBy=price-asc` sigue abierto. [RENDIMIENTO-PENDIENTE.md](./RENDIMIENTO-PENDIENTE.md) conserva reproducción, alternativas descartadas y condición de aceptación. Ni el 30/30 sintético ni un 200 desde caché obsoleta demuestran que esa consulta funciona con el catálogo real.

La siguiente prioridad es corregir y medir esa lectura manteniendo IDs, totales, filtros y frescura. Después se repiten los controles afectados y se obtiene la aprobación para el commit exacto que se quiera publicar. [REVERSION.md](./REVERSION.md) identifica la versión pública verificada y el procedimiento preparado; no se ejecutó una reversión de prueba.

Los errores de clasificación de fuentes, identidad pendiente, cobertura G02, recepción real GA4 y recepción comercial conservan sus controles independientes. No se cierran por estas pruebas. El reporte contextual prepara el envío del visitante; no acredita consultas recibidas. Eneba no acredita ventas ni pagos y los anuncios continúan sin activación por esta sesión.

## Reproducción y evidencia

Desde el worktree, con el Worker QA aislado ya iniciado:

```sh
ENEBA_AFFILIATE_PILOT_ENABLED=1 \
  npx playwright test --config=playwright.workers.config.ts
PUBLIC_QA_ORIGIN=http://127.0.0.1:3105 npm run test:e2e:public
npm run verify
```

`playwright.workers.config.ts` admite sólo localhost o el Worker sintético identificado. La suite pública es de lectura y no se ejecuta el suite interactivo sobre producción.

Evidencia adicional: `testsprite-final-sanitized.json`, `source-manifest-final.json`, `deployment-control-sanitized.json`, `workers-full-browser-final.json`, `public-browser-final.log`, `verify-final.log`, `database-final-regressions.log` y los dos logs de build final en `outputs/release-candidate-2026-10-05/`. Los artefactos originales de TestSprite y metadatos de cuenta siguen locales/ignorados. No se publicaron credenciales, enlaces firmados, identidades privadas ni conversaciones.
