# Project State

Fecha: 2026-03-04

## Resumen ejecutivo

- Estado general: funcional y estable para busqueda/detalle.
- Build y lint: OK.
- Foco actual: observabilidad operativa + consolidacion de scraping multi-tienda.

## Implementado recientemente

1. Documentacion alineada
- `README.md` actualizado a stack real (Next 16 / React 19).
- Seccion de endpoints y panel admin actualizada.

2. Telemetria operativa (nueva)
- Nuevo modulo: `src/lib/telemetry/operational-metrics.ts`.
- Registro de eventos por tienda:
  - status (`ok`, `slow`, `blocked`, `no-results`, `error`)
  - latencia
  - cantidad de resultados
  - endpoint origen (`/api/search`, `/api/products`)
- Registro de eventos por endpoint:
  - status code
  - exito/fallo
  - latencia
  - cantidad de resultados
- Snapshot operativo agregado:
  - salud por tienda
  - salud por endpoint
  - alertas derivadas
  - logs recientes

3. Instrumentacion de APIs
- `src/app/api/search/route.ts`:
  - tracking de endpoint (hit/inflight/miss/error)
  - tracking por scraper no-Woo
  - integracion Woo con tracking por tienda
- `src/app/api/products/route.ts`:
  - tracking de endpoint (detalle/listado/error)
  - tracking por scraper no-Woo en detalle y listado
  - integracion Woo con tracking por tienda

4. WooCommerce con observabilidad por tienda
- `src/lib/scrapers/woocommerce.ts`:
  - medicion por tienda individual
  - backoff registrado como estado `blocked`
  - soporte de endpoint origen para separar trafico de `/api/search` y `/api/products`

5. Admin dashboard real (sin placeholders)
- `/admin`: resumen operativo
- `/admin/stores`: estado y metricas por tienda
- `/admin/scrapers`: rendimiento por endpoint + tiendas lentas
- `/admin/logs`: eventos operativos recientes
- `/admin/alerts`: alertas activas
- Nuevo endpoint: `GET /api/admin/operational`

## Limitaciones conocidas

- Telemetria en memoria de proceso:
  - no persiste tras reinicio/deploy
  - en entornos serverless no comparte estado entre instancias

## Proximos pasos sugeridos

1. Persistir telemetria en base de datos (Supabase) para historico real.
2. Agregar jobs de health-check periodicos por tienda.
3. Definir umbrales configurables de alertas (por tienda y por endpoint).
4. Exponer filtros de rango temporal en `/admin`.
