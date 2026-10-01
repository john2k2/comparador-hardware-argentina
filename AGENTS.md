# AGENTS.md — Comparador de Hardware Argentina

> Fuente de verdad para agentes de código. Si no sabés nada del proyecto, empezá acá.

## Resumen

Plataforma web para comparar precios de hardware entre ~20+ tiendas argentinas. Pixel-art retro (fuentes pixeladas, sin border-radius, parallax día/noche).

- **Scraping multi-fuente**: directo (Cheerio/fetch), WooCommerce, TiendaNube, PrestaShop, Qloud, Foxtienda.
- **Supabase** (PostgreSQL): catálogo, historial de precios, favoritos, alertas.
- **Auth**: Supabase Auth (Google OAuth + email/password).
- **SEO-first**: sitemaps dinámicos, Schema.org, OpenGraph.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Lenguaje | TypeScript 5.9 (strict) |
| Estilos | Tailwind CSS v4 |
| DB | Supabase (PostgreSQL) |
| Scraping | fetch + cheerio |
| Testing | Vitest 4 (unit), Playwright 1.59 (e2e) |
| Lint | ESLint 9 + eslint-config-next |
| Deploy | Cloudflare Workers (OpenNext) |
| Scheduler | GitHub Actions |

Requisitos: Node.js 20+, npm 10+.

## Comandos esenciales

```bash
npm install          # Instalación
npm run dev          # Dev server
npm run build        # Build prod
npm run start        # Servir build
npm run lint         # ESLint (ignora e2e/ por config)
npm test             # Unit tests (Vitest, una vez)
npm run test:watch   # Unit tests (watch)
npm run test:e2e     # E2E tests (Playwright)
```

**Levantar local**: copiar `.env.example` → `.env.local` y completar al menos `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Estructura clave

```
src/
  app/                 # Next.js App Router
    api/               # Route Handlers (REST API)
    admin/             # Panel admin
    auth/              # Login / OAuth callback
    search/            # Búsqueda
    product/[id]/      # Detalle
    comparativa/       # Comparativas SEO
    guia/              # Guías PC Gamer SEO
  components/          # React components
  lib/                 # Lógica de negocio
    scrapers/          # Scraping por tienda
    search/            # Búsqueda, ranking, dedupe
    persistence/       # Lectura/escritura Supabase
    catalog/           # Categorías y metadatos
    cache/             # Cache server/client
    server/            # Auth admin, rate limiting, background refresh
    seo/               # Metadata, sitemaps, FAQ schema
    ai/                # Normalización de títulos (heurística local)
supabase/migrations/   # SQL ordenados por timestamp
e2e/                   # Tests E2E (Page Object Model)
public/                # Assets estáticos
```

**Alias**: `@/` → `src/` (tsconfig.json, vitest.config.ts).

## Convenciones

- **Comentarios/docs**: español. **Código** (variables, funciones, tipos): inglés. **UI**: español (argentino).
- Server Components por defecto. `'use client'` solo para hooks, eventos DOM, localStorage.
- Tailwind v4 con `@theme` en `globals.css`. **Sin border-radius** (`--radius-*: 0px`).
- Fuente pixel: `Press_Start_2P` (clase `font-pixel`).
- API routes delegan a handlers en `lib/` (ej: `search/route.ts` → `lib/search/search-route-handler.ts`).
- Scrapers devuelven `ScraperResult<T>` con `ok()` / `fail()`.
- Logger: `src/lib/logger.ts` (no `console.log`). Niveles: debug, info, warn, error, silent.

## Delegación de agentes para desarrollo

- La tarea principal usa el modelo elegido por quien inicia la tarea. Para trabajo complejo, el coordinador debe conservar las decisiones de arquitectura, seguridad y verificación final.
- Los subagentes por defecto usan `gpt-5.6-luna` con razonamiento `high`, definidos en `.codex/`. Se usan solo cuando el trabajo es repetitivo o intensivo en lectura: mapear 3+ archivos, detectar patrones, redactar tests desde una referencia o preparar stubs acotados.
- `bulk-reader` es estrictamente de lectura y devuelve un resumen estructurado. `pattern-writer` solo puede escribir tests, documentación o stubs explícitamente solicitados que sigan un archivo de referencia.
- No delegar cambios de producción, migraciones/RLS, autenticación/autorización, secretos, despliegue, configuración Cloudflare, scraping ni debugging de concurrencia a Luna. El coordinador debe inspeccionar el diff y ejecutar la verificación proporcional antes de dar una tarea por terminada.
- No delegar tareas pequeñas o lecturas puntuales: crear subagentes añade costo y latencia. Cuando haya duda, usar una lectura focalizada en el agente principal.

## API interna

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/search?q=...` | GET | Búsqueda global multi-tienda |
| `/api/products?category=...` | GET | Listado por categoría |
| `/api/products?id=...` | GET | Detalle de producto |
| `/api/categories` | GET | Categorías disponibles |
| `/api/stores` | GET | Tiendas configuradas |
| `/api/home/sections` | GET | Secciones dinámicas home |
| `/api/auth/session` | GET/POST | Sesión de usuario |
| `/api/admin/operational` | GET | Snapshot dashboard admin |
| `/api/admin/catalog-refresh` | GET/POST | Refresh de catálogo |

**Seguridad `/api/admin/*`**: requiere cookie de admin o `Authorization: Bearer <CRON_SECRET>`.

## Scraping y catálogo

- Tiendas definidas en `src/lib/scrapers/scraper-registry.ts`.
- **Directas**: Mexx, Venex, FullH4rd, CompraGamer, Maximus, Gezatek, Compugarden, Gaming City, Logg, XTPC, WizTech.
- **WooCommerce** (11): Katech, Dinobyte, MaxTecno, TheGamerShop, Hardcore, GoldenTechStore, Acuario Insumos, Beings, Gamers Point, LionTech, SCP Hardstore.
- **Plataformas**: TiendaNube, PrestaShop, Qloud, Foxtienda.
- **PortalTech**: pasa por Cloudflare (token opcional).
- Rate limit por defecto: 2s entre requests. Backoff ante 403/429 para WooCommerce.

### Refresh del catálogo

Endpoint `/api/admin/catalog-refresh` soporta modos:
- `tracked`: productos en `user_favorites` + `price_alerts` activas.
- `hot`: productos stale marcados como hot/tracked.
- `full`: barrido completo por categorías.
- `custom`: por `query` o `categories`.
- `cleanup-history`: compacta `price_history` (14d raw, 90d hourly, 365d daily, purge > 365d).

Params: `maxQueries` (default 40, max 200), `staleMinutes` (default 180), `stores`.

## Base de datos (Supabase)

### Tablas principales
- `products`: catálogo normalizado, claves canónicas, prioridades de refresh.
- `product_prices`: precios actuales por tienda.
- `price_history`: evolutivo de precios (con retención programada).
- `stores`: configuración de tiendas.
- `user_profiles`, `user_favorites`, `price_alerts`: auth y personalización.
- `shared_cache`, `rate_limits`: cache server-side y rate limiting.

### Migraciones
- Ubicación: `supabase/migrations/`.
- Naming: `YYYYMMDDHHMMSS_descripcion.sql`.
- Orden cronológico obligatorio.

### RLS
Tablas de usuario (`user_profiles`, `user_favorites`, `price_alerts`) tienen Row Level Security por `auth.uid()`.

## Testing

### Unitarios (Vitest)
- Config: `vitest.config.ts`.
- Patrón: `src/**/*.test.ts`.
- Entorno: `node`.

### E2E (Playwright)
- Config: `playwright.config.ts`.
- Directorio: `e2e/`.
- **POM**: `e2e/pages/base.page.ts`, `home.page.ts`, `search.page.ts`. Fixtures en `e2e/fixtures/pages.fixture.ts`.
- Web server: hace `npm run build` y levanta en `PORT=3100`.
- Variables de entorno: `DISABLE_INTERNAL_BACKGROUND_REFRESH=1`, `DISABLE_LIVE_SCRAPING=1`, `E2E_STABLE_MODE=1`, `CI_E2E=1`.
- Browser: Chrome desktop (`channel: 'chrome'`).
- `workers: 1`, `fullyParallel: false`.

### Lint
- ESLint 9 con `eslint-config-next` (core-web-vitals + typescript).
- Ignora `e2e/`, `.next/`, `tmp/`, `debug-*.js`, `test-*.js`, `take_screenshots.mjs`.

## Despliegue y CI/CD

### Cloudflare Workers
- Deploy de Next.js con OpenNext y `wrangler.jsonc`.
- El dominio público usa `comparador-hardware-argentina`; GitHub despliega `main` con Workers Builds.
- Comandos locales: `npm run preview`, `npm run upload` y `npm run deploy`.
- Bundle analyzer: `ANALYZE=true npm run build`.

### GitHub Actions
- Workflow: `.github/workflows/catalog-refresh.yml`.
- **Catálogo adaptativo**: `.github/workflows/catalog-adaptive-refresh.yml` al minuto 41 de cada hora, runner Node con máximo de 17 min y 2500 ofertas por ejecución, cola privada persistente con reservas de mantenimiento. GitHub puede retrasar cron.
- Catálogo general admite observaciones de hasta 24 h; guías y armador mantienen 3 h. Frecuencias objetivo: favoritos/alertas 3 h, componentes o interés de Analytics 24 h, gabinete/refrigeración 72 h y mantenimiento 168 h. Un intento fallido no renueva precio ni stock.
- Analytics se importa semanalmente como usuarios únicos agregados por ID exacto; no usar contadores del API como demanda humana.
- **Schedule de guías**: `priority` diario a las `05:05` UTC (guías y muestra fija G02); `guides` al minuto 17 de las otras horas. Revisa ofertas conocidas desde 90 minutos sin ampliar su elegibilidad de tres horas. GitHub puede retrasar cron: verificar horarios reales y cobertura.
- Proceso prioritario: exclusivo del runner, destinos conocidos y límites por ejecución; registra observaciones guardadas y comparables en el artefacto. Las comprobaciones horarias y las ejecuciones manuales no cuentan como ciclos diarios útiles G02.
- Soporta `workflow_dispatch` con parámetros (`mode`, `query`, `categories`, `stores`, `max_queries`, `stale_minutes`).
- Requiere secret: `CATALOG_REFRESH_CRON_SECRET`.
- Opcional: `CATALOG_REFRESH_BASE_URL` (default `https://www.comparador-hardware.com.ar`).

### Barrido adaptativo del catálogo (01/10/2026)

- `.github/workflows/catalog-adaptive-refresh.yml`: minuto 41 de cada hora, máximo 2500 ofertas y 17 minutos de procesamiento; cola y progreso persistentes en Supabase. El límite de ejecución no acredita cobertura completa.
- Componentes: 24 h; gabinetes/refrigeración: 72 h; mantenimiento: 168 h. Favoritos/alertas y guías conservan sus reglas más estrictas. Analytics puede promover interés real sin degradar la base por datos escasos.
- CompraGamer comparte el feed; MaxTecno/Katech agrupan URLs conocidas mediante Store API y contrastan una página visible por fuente/ejecución. SCP permanece en HTML por discrepancia de precio comprobada. Una ausencia o un bloqueo no es agotamiento ni observación nueva.
- `custom-worker.mjs` conserva el handler de OpenNext y añade un respaldo al minuto 11. Sólo comprueba y despacha Actions; no ejecuta scraping en Cloudflare. Omite trabajos activos o iniciados hace menos de 75 minutos y limita los despachos a uno por hora mediante Supabase.
- `CATALOG_SCHEDULER_ENABLED=0` desactiva el respaldo. Usa las credenciales privadas existentes; jamás publicarlas. Registrar el origen `manual`, `github-schedule` o `cloudflare-fallback` en los resúmenes y comprobar ejecuciones reales, no sólo la configuración.
- Medir ofertas observadas y comparables por separado. La meta de 95% del subconjunto prioritario en 24 h requiere siete días reales y permanece abierta mientras no haya evidencia. No reducir el denominador ni renovar fechas para simular cumplimiento.

## Variables de entorno clave

Ver `.env.example` para listado completo.

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase (cliente) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública Supabase |
| `SUPABASE_SECRET_KEY` | Clave server-side (nunca al cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Migraciones / operaciones privilegiadas |
| `SITE_URL` | URL canónica |
| `GOOGLE_SITE_VERIFICATION` | Search Console |
| `GEMINI_API_KEY` | Normalización con IA (opcional) |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | PortalTech (opcional) |
| `CRON_SECRET` / `CATALOG_REFRESH_CRON_SECRET` | Protección endpoints admin |
| `DISABLE_INTERNAL_BACKGROUND_REFRESH` | Desactiva refresh background (`1`) |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Google Analytics 4 (opcional) |
| `NEXT_PUBLIC_SPONSORED_STORE_IDS` | IDs tiendas sponsor (opcional) |

## Consideraciones de seguridad

- **NUNCA** exponer `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` ni `CATALOG_REFRESH_CRON_SECRET` al cliente.
- Variables `NEXT_PUBLIC_*` se inyectan en el bundle del navegador. Solo datos públicos.
- Endpoints `/api/admin/*` validan auth por cookie o bearer token.
- RLS activo en tablas de usuario.
- Rate limiting en memoria (server-side) para API de búsqueda.
- `nonce` de CSP inyectado en scripts inline (`layout.tsx`).
- Headers de seguridad en `next.config.ts` (HSTS, CSP, etc.).

## Notas operativas

- Monitoreo actual es **en memoria de proceso** (no persistente entre reinicios/deploy).
- Normalización de títulos usa heurística local determinística. No requiere servicios externos.
- Estado de auditoría y backlog técnico: `docs/archive/AUDITORIA_Y_PLAN.md`. Auditoría técnica (2026-08-15): `docs/archive/AUDITORIA_TECNICA_2026-08-15.md`.
- Sprites SVG de fondo parallax se precargan en `layout.tsx` vía `<link rel="preload">`.

## Publicación de guías con presupuesto

Criterio de Jonathan, actualizado el 30/09/2026: antes de crear o renovar una guía, verificar todas las piezas en publicaciones comprables. Las guías editoriales publicadas admiten hasta un 10% sobre su presupuesto de referencia entre revisiones semanales o a pedido. No rehacerlas ni realizar una revisión manual diaria por variaciones dentro de ese margen. El armador personalizado conserva el máximo exacto elegido por el usuario. La observación automática de ofertas conserva stock, identidad y frescura; no equivale a renovar la selección editorial.

- Exigir siete ofertas elegibles: precio positivo, stock informado, identidad y variante correctas, observación real de cada oferta de hasta tres horas y total dentro de la referencia más el margen editorial del 10%. Elegir la siguiente oferta válida del mismo modelo si la más barata no cumple; si no alcanza, revisar la selección y su compatibilidad antes de publicar.
- Contrastar precio, condición de pago, SKU y stock en la tienda. Una fixture, un timestamp de producto, un build aprobado o HTTP 200 no prueban disponibilidad. No inferir agotamiento porque venza la ventana de frescura.
- Comprobar CPU y refrigeración incluida o presupuestada, socket/BIOS, generación y kit de RAM, QVL sin inventar certificación, almacenamiento, conectores de fuente y espacio de gabinete/GPU. Separar envío, armado, licencia y periféricos.
- Registrar fuentes, URLs, fecha/hora, siete precios y total; revisar la guía publicada en escritorio y móvil. No presentar como PC completa un subtotal parcial ni prometer FPS sin evidencia. Mantener las reglas de identidad y frescura activas.
- La verificación es un corte, no una garantía futura ni autorización para ampliar el piloto AdSense. El seguimiento automático conserva sus límites y no despacha refresh.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
