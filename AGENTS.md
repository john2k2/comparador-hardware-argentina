# AGENTS.md — Comparador de Hardware Argentina

> Este archivo es la fuente de verdad para agentes de código que trabajen en este proyecto. Si no sabés nada del proyecto, empezá acá.

---

## Resumen del proyecto

**Comparador de Hardware Argentina** es una plataforma web para comparar precios de hardware entre tiendas argentinas. El producto se basa en:

- **Scraping multi-fuente** de ~20+ tiendas (directas vía Cheerio/fetch, WooCommerce, TiendaNube, PrestaShop, Qloud, Foxtienda).
- **Persistencia en Supabase** (PostgreSQL) con catálogo de productos, historial de precios, favoritos de usuarios y alertas.
- **Panel administrativo** (`/admin`) con métricas operativas por tienda y endpoint.
- **Auth de usuarios** vía Supabase Auth (Google OAuth + email/password).
- **SEO-first**: sitemaps, meta tags, Schema.org, OpenGraph, Google Search Console.

El estilo visual es **pixel-art retro** (fuentes pixeladas, bordes cuadrados sin radius, fondos animados con parallax día/noche).

---

## Stack tecnológico

| Capa | Tecnología | Versión aprox. |
|------|-----------|----------------|
| Framework | Next.js (App Router) | 16.2.1 |
| UI | React | 19.2.3 |
| Lenguaje | TypeScript | 5.9.3 |
| Estilos | Tailwind CSS v4 | 4.x |
| PostCSS | `@tailwindcss/postcss` | 4.x |
| Base de datos | Supabase (PostgreSQL) | SDK `@supabase/supabase-js` 2.98 |
| Scraping | `fetch` nativo + `cheerio` | — |
| Normalización IA | Google Gemini (`@google/genai`) | opcional |
| Testing unitario | Vitest | 4.0.18 |
| Testing E2E | Playwright | 1.59 |
| Lint | ESLint 9 + `eslint-config-next` | — |
| Deploy | Vercel (estándar) | — |
| Scheduler | GitHub Actions | cron propio |

**Requisitos mínimos**: Node.js 20+, npm 10+.

---

## Comandos esenciales

```bash
# Instalación
npm install

# Desarrollo local
npm run dev

# Build de producción
npm run build

# Servir build local
npm run start

# Lint
npm run lint

# Tests unitarios (Vitest)
npm test
npm run test:watch

# Tests E2E (Playwright)
npm run test:e2e
```

**Variables de entorno mínimas** para levantar el proyecto: copiá `.env.example` a `.env.local` y completá al menos `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Estructura de directorios

```text
src/
  app/                    # Next.js App Router
    api/                  # Route Handlers (REST API interna)
      search/route.ts
      products/route.ts
      stores/route.ts
      categories/route.ts
      home/sections/route.ts
      auth/session/route.ts
      admin/
        operational/route.ts
        catalog-refresh/route.ts
    admin/                # Panel admin (pages)
    auth/                 # Login / callback OAuth
    search/               # Página de búsqueda
    product/[id]/         # Detalle de producto
    acerca/               # Páginas estáticas
    contacto/
    privacidad/
    terminos/
    layout.tsx            # Root layout (SEO, parallax, nav, footer)
    page.tsx              # Home
    globals.css           # Tailwind v4 + design tokens pixel-art
    sitemap.ts            # Sitemap dinámico
    robots.ts             # robots.txt dinámico
  components/
    functional/           # Analytics, ThemeScript, CommercialDisclosure
    home/                 # Secciones de la home
    layout/               # Navigation, etc.
    product/              # Tarjetas y detalle de producto
    search/               # Filtros, resultados, paginación
    ui/                   # Componentes base (shadcn-like propios)
  lib/
    scrapers/             # Lógica de scraping por tienda
    search/               # Búsqueda, ranking, dedupe, paginación
    products/             # Servicios de listado y detalle
    persistence/          # Lectura/escritura en Supabase
    catalog/              # Categorías y metadatos del catálogo
    cache/                # Cache server/client de búsquedas
    server/               # Auth admin, rate limiting, shared cache, background refresh
    seo/                  # Sitemaps, metadata helpers, FAQ schema
    analytics/            # GA4 helpers
    metrics/              # Métricas operativas en memoria
    telemetry/            # Métricas expuestas
    ai/                   # Normalización de productos con Gemini
    client/               # Hooks y lógica cliente (auth, recientes)
supabase/migrations/      # Migraciones SQL (ordenadas por timestamp)
e2e/                      # Tests E2E con Playwright (Page Object Model)
public/                   # Assets estáticos (sprites SVG, OG image)
```

**Alias de importación**: `@/` apunta a `src/`. Configurado en `tsconfig.json` y `vitest.config.ts`.

---

## Convenciones de código

### Idioma
- **Comentarios y documentación**: español.
- **Código (nombres de variables, funciones, tipos)**: inglés.
- **UI visible al usuario**: español (argentino).

### Estilo
- TypeScript `strict: true`.
- React 19 con Server Components por defecto. Usar `'use client'` solo cuando sea necesario (hooks, eventos del DOM, localStorage).
- Tailwind v4 con `@theme` en `globals.css`. **Sin border-radius** (`--radius-*: 0px`) por diseño pixel-art.
- Fuente principal: `Press_Start_2P` (Google Fonts), aplicada como `font-pixel`.
- Colores basados en CSS variables que cambian con `.dark` (tema claro/oscuro).

### Patrones comunes
- **API routes**: delegan a handlers en `lib/` (ej. `search/route.ts` → `lib/search/search-route-handler.ts`).
- **Scrapers**: cada tienda tiene su propio archivo. Los scrapers comparten helpers (`scraper-helpers.ts`, `scraper-registry.ts`).
- **Result types**: los scrapers devuelven `ScraperResult<T>` con `ok()` / `fail()`.
- **Logger**: usar `src/lib/logger.ts` (no `console.log` directo). Niveles: `debug`, `info`, `warn`, `error`, `silent`. En producción loguea JSON.

---

## API interna (Route Handlers)

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/search?q=...` | GET | Búsqueda global multi-tienda |
| `/api/products?category=...` | GET | Listado por categoría |
| `/api/products?id=...` | GET | Detalle de producto |
| `/api/categories` | GET | Categorías disponibles |
| `/api/stores` | GET | Tiendas configuradas |
| `/api/home/sections` | GET | Secciones dinámicas de la home |
| `/api/auth/session` | GET/POST | Sesión de usuario (Supabase) |
| `/api/admin/operational` | GET | Snapshot para dashboard admin |
| `/api/admin/catalog-refresh` | GET/POST | Refresh programado del catálogo |

**Seguridad en `/api/admin/*`**: requiere cookie de admin o `Authorization: Bearer <CRON_SECRET>`.

---

## Scraping y catálogo

- Las tiendas se definen en `src/lib/scrapers/scraper-registry.ts`.
- **Tiendas directas** (Cheerio/fetch): Mexx, Venex, FullH4rd, CompraGamer, Maximus, Gezatek, Compugarden, Gaming City, Logg, XTPC, WizTech.
- **WooCommerce** (11 tiendas): Katech, Dinobyte, MaxTecno, TheGamerShop, Hardcore, GoldenTechStore, Acuario Insumos, Beings, Gamers Point, LionTech, SCP Hardstore.
- **Plataformas**: TiendaNube, PrestaShop, Qloud, Foxtienda.
- **PortalTech** pasa por Cloudflare (requiere token opcional).
- Rate limit por defecto: 2 segundos entre requests.
- Backoff ante bloqueos (403/429) para WooCommerce.

### Refresh del catálogo
El endpoint `/api/admin/catalog-refresh` soporta modos:
- `tracked`: productos en `user_favorites` + `price_alerts` activas.
- `hot`: productos stale marcados como `hot/tracked`.
- `full`: barrido completo por categorías.
- `custom`: por `query` o `categories`.
- `cleanup-history`: compacta `price_history` (14d raw, 90d hourly, 365d daily, purge > 365d).

Params útiles: `maxQueries` (default 40, max 200), `staleMinutes` (default 180), `stores`.

---

## Base de datos (Supabase)

### Tablas principales
- `products`: catálogo con normalización, claves canónicas, prioridades de refresh.
- `product_prices`: precios actuales por tienda.
- `price_history`: evolutivo de precios (con política de retención).
- `stores`: configuración de tiendas.
- `user_profiles`, `user_favorites`, `price_alerts`: auth y personalización.
- `shared_cache`, `rate_limits`: cache server-side y rate limiting.

### Migraciones
Van en `supabase/migrations/` con naming `YYYYMMDDHHMMSS_descripcion.sql`. Orden cronológico obligatorio.

### RLS
Las tablas de usuario tienen Row Level Security por `auth.uid()`.

---

## Testing

### Unitarios (Vitest)
- Config: `vitest.config.ts`.
- Patrón: `src/**/*.test.ts`.
- Entorno: `node`.
- Cobertura de lógica pura: scrapers, utils de precios, identidad de productos, serialización, paginación, SEO, etc.

### E2E (Playwright)
- Config: `playwright.config.ts`.
- Directorio: `e2e/`.
- **Patrón Page Object Model (POM)**:
  - `e2e/pages/base.page.ts` — componentes reutilizables (nav, footer).
  - `e2e/pages/home.page.ts`, `search.page.ts` — páginas específicas.
  - `e2e/fixtures/pages.fixture.ts` — fixtures de Playwright con páginas tipadas.
- Web server: hace `npm run build` y levanta en `PORT=3100`.
- Variables de entorno en E2E: `DISABLE_INTERNAL_BACKGROUND_REFRESH=1`, `DISABLE_LIVE_SCRAPING=1`, `E2E_STABLE_MODE=1`.
- Browser: Chrome desktop (`channel: 'chrome'`).
- `workers: 1`, `fullyParallel: false`.

### Lint
- ESLint 9 con `eslint-config-next` (core-web-vitals + typescript).
- Ignora `e2e/`, `.next/`, `tmp/`, `debug-*.js`, `test-*.js`, `take_screenshots.mjs`.

---

## Despliegue y CI/CD

### Vercel
- Deploy estándar de Next.js.
- El proyecto no depende de los cron de Vercel (Hobby los limita).

### GitHub Actions
- Workflow: `.github/workflows/catalog-refresh.yml`.
- Ejecuta refresh del catálogo vía HTTP contra la URL de producción.
- **Schedule actual**:
  - `tracked`: cada 30 minutos (`:13` y `:43` UTC).
  - `hot`: cada 3 horas (`:18` UTC).
  - `full`: diario a las `05:05` UTC.
  - `cleanup-history`: diario a las `05:35` UTC.
- Soporta `workflow_dispatch` con parámetros (`mode`, `query`, `categories`, `stores`, `max_queries`, `stale_minutes`).
- Requiere secrets:
  - `CATALOG_REFRESH_CRON_SECRET`
  - `CATALOG_REFRESH_BASE_URL` (opcional, default `https://www.comparador-hardware.com.ar`)

### Bundle analyzer
- Habilitar con `ANALYZE=true npm run build`.

---

## Variables de entorno clave

Ver `.env.example` para el listado completo. Las más importantes:

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase (cliente) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública Supabase |
| `SUPABASE_SECRET_KEY` | Clave server-side (nunca expuesta al cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo migraciones / operaciones privilegiadas |
| `SITE_URL` | URL canónica del sitio |
| `GOOGLE_SITE_VERIFICATION` | Meta tag para Search Console |
| `GEMINI_API_KEY` | Normalización de productos con IA (opcional) |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Para PortalTech (opcional) |
| `CRON_SECRET` / `CATALOG_REFRESH_CRON_SECRET` | Protección de endpoints admin/cron |
| `DISABLE_INTERNAL_BACKGROUND_REFRESH` | Desactiva refresh en background (`1`) |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Google Analytics 4 (opcional) |
| `NEXT_PUBLIC_SPONSORED_STORE_IDS` | IDs de tiendas sponsor (opcional) |

---

## Consideraciones de seguridad

- **NUNCA** exponer `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` ni `CATALOG_REFRESH_CRON_SECRET` al cliente.
- Las variables `NEXT_PUBLIC_*` se inyectan en el bundle del navegador. Solo usarlas para datos realmente públicos.
- Los endpoints `/api/admin/*` validan auth por cookie o bearer token.
- RLS activo en tablas de usuario (`user_profiles`, `user_favorites`, `price_alerts`).
- Rate limiting en memoria (server-side) para proteger la API de búsqueda.
- `nonce` de CSP inyectado en scripts inline (`layout.tsx`).

---

## Notas operativas

- El monitoreo actual es **en memoria de proceso** (no persistente entre reinicios/deploy).
- La normalización de títulos de productos usa Gemini de forma opcional; si falla o no está configurado, el sistema sigue funcionando con lógica local.
- El estado de auditoría, backlog técnico y evidencia operativa vive en `AUDITORIA_Y_PLAN.md` (no en este archivo).
- Los sprites SVG de fondo parallax se precargan en `layout.tsx` vía `<link rel="preload">`.
