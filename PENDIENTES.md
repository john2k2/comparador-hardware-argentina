# Pendientes

Fecha de actualizacion: 2026-03-04

## Dashboard de control

- Estado: implementado (v1 operativa)
- Alcance actual:
  - Estado por tienda (OK, lento, bloqueado 403/429, sin resultados, error).
  - Metricas por tienda (latencia, resultados, tasa de exito 24h).
  - Historial reciente de fallos por tienda.
  - Alertas por bloqueos y degradacion.
  - Logs resumidos por endpoint (`/api/search`, `/api/products`).
- Pendiente de esta linea:
  - Persistencia historica (actualmente telemetria en memoria de proceso).
  - Umbrales de alertas configurables.
  - Filtros de rango temporal en el dashboard.

## Resumen de lo hecho (WooCommerce)

- Se consolido un set Woo estable y activo:
  - `katech`
  - `dinobyte`
  - `maxtecno`
  - `thegamershop`
  - `hardcore`
  - `goldentechstore`
- Se removieron del flujo Woo tiendas inestables/no compatibles para evitar bloqueos y ruido.
- Se robustecio el parser Woo:
  - Soporte de selector adicional `div.type-product`.
  - Extraccion de nombre con fallbacks para distintos themes.
  - Extraccion de precio con mas variantes de selector.
- Se agrego control anti-bloqueo:
  - Backoff por tienda ante `403/429`.
  - Limite de concurrencia para Woo (`WOO_CONCURRENCY = 3`).
  - Header `Referer` por tienda en requests de scraping.
- Se alineo UI con backend:
  - `goldentech` -> `goldentechstore`.
  - Se ajusto el listado de tiendas visibles a las activas Woo.
- Validaciones ejecutadas:
  - `npm run build` OK.
  - Pruebas de scraping con resultados consistentes en el set Woo activo.

## Estabilidad y cache (actualizado)

- Se redujeron errores 404 de detalle agregando snapshot compartido de productos entre `/api/search` y `/api/products`.
- `/api/products` ahora prioriza cache/snapshot antes de re-scrapear y agrega deduplicacion de requests en vuelo por ID.
- `/api/search` ahora deduplica requests concurrentes por clave (`INFLIGHT`) y extiende TTL de cache de respuesta.
- En frontend:
  - `/search` persiste cache en `sessionStorage` para mantener resultados al navegar y volver.
  - `/product/[id]` persiste cache de detalle en cliente para evitar recargas innecesarias.

## Estado No-Woo

- Decidido: **no usar HardGamers** como fuente de datos del comparador.
- Motivo: HardGamers es agregador y replica el mismo modelo de negocio/funcion.
- Accion aplicada: se removio la integracion HardGamers de APIs y del flujo de scraping.
- Implementado: scrapers directos de `maximus`, `gezatek` y `compugarden`.
  - Integrados en `/api/search` (busqueda global).
  - Integrados en `/api/products` (detalle por ID y fallback de re-scrape).
  - Agregados al listado de tiendas visibles/filtros (`static-data`).

## Proximo paso recomendado

- Implementar el siguiente bloque de tiendas no-Woo directas (sin agregadores), priorizando las de mayor cobertura.
- Persistir telemetria del dashboard en base de datos para historico y comparativas.
