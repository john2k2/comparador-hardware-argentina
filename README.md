# Comparador de Hardware Argentina

Plataforma web para comparar precios de hardware en tiendas argentinas, con scraping multi-fuente y panel operativo.

## Estado actual (2026-03-16)

- Base funcional de busqueda y detalle operativa.
- Cache server/client activa para mejorar estabilidad y navegacion.
- Integracion WooCommerce consolidada con backoff ante bloqueos (403/429).
- Integraciones no-Woo activas (Maximus, Gezatek, Compugarden, entre otras).
- Dashboard admin operativo con metricas reales por tienda y endpoint.

## Stack real del proyecto

- Next.js `16.1.6` (App Router)
- React `19.2.3`
- TypeScript `5.9`
- Tailwind CSS `v4`
- Supabase SDK (`@supabase/supabase-js`)
- Scraping con `fetch` + `cheerio`

## Requisitos

- Node.js 20+
- npm 10+

## Instalacion

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

Variables minimas:

```bash
NEXT_PUBLIC_SUPABASE_URL=tu-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-supabase-anon-key
```

Variables recomendadas del lado servidor para que funcionen bien
cache compartida, rate limiting y persistencia del catalogo:

```bash
SUPABASE_URL=tu-supabase-url
SUPABASE_ANON_KEY=tu-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

Variables publicas recomendadas para produccion/SEO:

```bash
SITE_URL=https://comparador-hardware.com.ar
GOOGLE_SITE_VERIFICATION=tu-token-real-de-search-console
SUPPORT_EMAIL=contacto@tu-dominio.com
```

Si usas normalizacion con Gemini:

```bash
GEMINI_API_KEY=tu-gemini-api-key
GEMINI_BATCH_TIMEOUT_MS=3500
GEMINI_BATCH_SIZE=15
```

Si usas integraciones que pasan por Cloudflare:

```bash
CLOUDFLARE_API_TOKEN=tu-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=tu-cloudflare-account-id
```

Si usas refresh programado de catalogo por cron:

```bash
CRON_SECRET=tu-cron-secret-seguro
# opcional (si queres separar secreto del cron general)
CATALOG_REFRESH_CRON_SECRET=tu-cron-secret-catalogo
```

Si quieres desactivar el background refresh interno en un entorno puntual:

```bash
DISABLE_INTERNAL_BACKGROUND_REFRESH=1
```

3. Desarrollo local:

```bash
npm run dev
```

4. Build de produccion:

```bash
npm run build
npm run start
```

## Scripts

- `npm run dev`: servidor de desarrollo
- `npm run build`: build de produccion
- `npm run start`: correr build en modo produccion
- `npm run lint`: chequeo de lint
- `npm test`: tests unitarios (`vitest`)
- `npm run test:e2e`: smoke e2e (`playwright`)

## Estructura principal

```text
src/
  app/
    api/
      search/route.ts
      products/route.ts
      stores/route.ts
      categories/route.ts
      admin/operational/route.ts
    admin/
      page.tsx
      stores/page.tsx
      scrapers/page.tsx
      logs/page.tsx
      alerts/page.tsx
    search/page.tsx
    product/[id]/page.tsx
  lib/
    scrapers/
    cache/
    telemetry/
```

## Endpoints API

- `GET /api/search?q=...`
  - Busqueda global de productos (multi-tienda).
- `GET /api/products?category=...`
  - Listado por categoria.
- `GET /api/products?id=...`
  - Detalle de producto por ID.
- `GET /api/categories`
  - Categorias disponibles.
- `GET /api/stores`
  - Tiendas visibles/configuradas.
- `GET /api/admin/operational`
  - Snapshot operativo para dashboard admin (tiendas, endpoints, logs, alertas).
- `GET|POST /api/admin/catalog-refresh`
  - Refresh DB-first de catalogo.
  - Soporta modos:
    - `mode=cleanup-history`: compacta `price_history` por ventanas (`14d` raw, `90d` hourly, `365d` daily, purge > `365d`).
    - `mode=tracked`: productos de `user_favorites` + `price_alerts` activas.
    - `mode=hot`: productos `hot/tracked` stale por `last_scraped_at`.
    - `mode=full`: barrido por categorias.
    - `mode=custom`: por `query` o `categories`.
  - Params utiles:
    - `maxQueries` (default `40`, max `200`)
    - `staleMinutes` (default `180`)
    - `stores` (`id1,id2,...`)
  - Seguridad:
    - Admin (cookie/bearer) o cron secret (`Authorization: Bearer <CRON_SECRET>`).

## Cron de catalogo (Vercel)

El repo incluye `vercel.json` con 4 jobs:

- `tracked` cada 30 minutos.
- `hot` cada 3 horas.
- `full` diario (`05:00` UTC).
- `cleanup-history` diario (`05:30` UTC).

Ejemplos manuales:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://tu-dominio.com/api/admin/catalog-refresh?mode=tracked&maxQueries=30"
```

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"mode":"custom","query":"ryzen 5600"}' \
  "https://tu-dominio.com/api/admin/catalog-refresh"
```

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://tu-dominio.com/api/admin/catalog-refresh?mode=cleanup-history"
```

## Panel admin

Rutas:

- `/admin`: resumen general
- `/admin/stores`: salud por tienda (status, latencia, exito, fallos)
- `/admin/scrapers`: rendimiento por endpoint y tiendas lentas
- `/admin/logs`: eventos recientes de scraping y API
- `/admin/alerts`: alertas de bloqueos y degradacion

## Auth de usuarios (Google + email/password)

Rutas:

- `/auth`: login/registro
- `/auth/callback`: retorno de OAuth (Google)

Configuracion en Supabase:

1. Activar provider Google en `Auth > Providers > Google`.
2. Agregar Authorized redirect URI:
   - `https://TU_DOMINIO/auth/callback`
   - `http://localhost:3000/auth/callback`
3. Aplicar migraciones para tablas de usuario:
   - `user_profiles`
   - `user_favorites`
   - `price_alerts`

Notas:

- Las tablas de favoritos y alertas tienen RLS por `auth.uid()`.
- Esto deja lista la base para:
  - favoritos por usuario
  - alertas por baja de precio (`any_drop`)
  - alertas de nuevo minimo historico (`new_low`)
  - alertas por precio objetivo (`target_price`)

## Fuentes actualmente integradas

**Directas (Cheerio/fetch):** Mexx, Venex, FullH4rd, CompraGamer, Maximus, Gezatek, Compugarden, Gaming City, Logg, PortalTech (via Cloudflare), XTPC, WizTech

**WooCommerce (11 tiendas):** Katech, Dinobyte, MaxTecno, TheGamerShop, Hardcore, GoldenTechStore, Acuario Insumos, Beings, Gamers Point, LionTech, SCP Hardstore

**Plataformas:** TiendaNube, Prestashop, Qloud, Foxtienda

## Notas

- El monitoreo actual es en memoria de proceso (no persistente entre reinicios/deploy).
- El estado de auditoria, backlog tecnico y evidencia operativa vive en `AUDITORIA_Y_PLAN.md`.

## Search Console y verificacion real

Para conectar Google Search Console de forma correcta:

1. Agrega la propiedad del sitio en Search Console.
2. Si usas una **Domain property**, la verificacion se hace con un registro DNS/TXT.
3. Si usas una **URL-prefix property**, puedes verificar con el meta tag `google-site-verification`.
4. Copia el token real y guardalo en:

```bash
GOOGLE_SITE_VERIFICATION=tu-token-real
```

5. Despliega la app y verifica la propiedad desde Search Console.

Referencias oficiales:

- [Add a website property to Search Console](https://support.google.com/webmasters/answer/34592?hl=en)
- [Verify your site ownership](https://support.google.com/webmasters/answer/9008080?hl=en-GB)
- [Google-supported meta tags](https://developers.google.com/search/docs/crawling-indexing/special-tags)
