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
| Deploy | Vercel |
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

### Vercel
- Deploy estándar de Next.js.
- Bundle analyzer: `ANALYZE=true npm run build`.

### GitHub Actions
- Workflow: `.github/workflows/catalog-refresh.yml`.
- **Schedule actual** (reducido para cuenta gratuita): `full` diario a las `05:05` UTC.
- Soporta `workflow_dispatch` con parámetros (`mode`, `query`, `categories`, `stores`, `max_queries`, `stale_minutes`).
- Requiere secret: `CATALOG_REFRESH_CRON_SECRET`.
- Opcional: `CATALOG_REFRESH_BASE_URL` (default `https://www.comparador-hardware.com.ar`).

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
- Estado de auditoría y backlog técnico: `AUDITORIA_Y_PLAN.md`.
- Sprites SVG de fondo parallax se precargan en `layout.tsx` vía `<link rel="preload">`.
