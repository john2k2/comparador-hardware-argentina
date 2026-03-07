# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server at localhost:3000
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test runner is configured.

## Environment Variables

Required for full functionality (not needed when using mock data):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `FIRECRAWL_API_KEY`

The app falls back to mock data from `src/lib/scrapers/mock-data.ts` when Supabase is not configured.

## Architecture

Next.js 16 App Router (full-stack). TypeScript throughout. Tailwind CSS 4. React 19.

**Path alias**: `@/*` maps to `src/*`.

### Layers

- **`src/app/`** — Pages and API routes (Next.js App Router)
  - `page.tsx` — Home page with search interface
  - `product/[id]/page.tsx` — Product detail page
  - `api/search/route.ts` — Global text search across all scrapers
  - `api/products/route.ts` — Category browse + product-by-ID lookup
  - `api/categories/route.ts`, `api/stores/route.ts` — Static metadata endpoints

- **`src/components/`** — Three tiers:
  - `ui/` — Generic primitives (Button, Card, Badge, Input, Select, Skeleton)
  - `functional/` — Feature components (SearchBar, ProductCard, ProductGrid, Filters, PriceDisplay, BestPriceBadge, InstallmentPicker, ThemeScript)
  - `layout/` — Navigation

- **`src/lib/`** — Business logic:
  - `types.ts` — All TypeScript types/interfaces
  - `supabase.ts` — Supabase client (currently unused at runtime; DB integration is prepared but not wired to API routes)
  - `price-utils.ts` — Argentine peso formatting and installment calculation
  - `utils.ts` — General utilities (`cn` helper using clsx + tailwind-merge)
  - `firecrawl.ts` — AI-powered scraper for secondary stores (HardGamers, Compugarden, Maximus, Gezatek, Venex)
  - `store-apis.ts` — Direct store API integrations (Mercado Libre disabled; scaffolded for future use)
  - `scrapers/` — HTML scrapers (Mexx, Venex, Fullh4rd, CompraGamer) + static category/store data

### Data Flow

**Current (live scraping, no DB):** API routes scrape store websites on every request using `Promise.allSettled` across all active scrapers. Results are deduplicated by ID in-memory.

- `api/search` calls the four HTML scrapers with search query URLs
- `api/products` calls the same scrapers with category-specific URLs; CompraGamer uses its own JSON API (`/api/articulos?criterio=`)
- Product lookup by ID re-scrapes based on the ID prefix (`mexx-`, `venex-`, `fh-`, `cg-`); there is no persistent storage

**Secondary pathway (Firecrawl):** `src/lib/firecrawl.ts` uses `FIRECRAWL_API_KEY` to AI-scrape 5 additional stores. Has in-memory cache (1h TTL). Not currently called from the API routes.

**Supabase pathway (prepared, not active):** `src/lib/supabase.ts` has all DB query functions but API routes do not call them.

### Scraper Pattern

Each HTML scraper in `src/lib/scrapers/` (mexx, venex, fullh4rd) uses `cheerio` to parse store HTML. CompraGamer uses its JSON REST API directly. All scrapers accept `(url: string, category: HardwareCategory)` and return `Product[]`. Adding a new store requires:
1. Creating `src/lib/scrapers/<store>.ts` with a `fetch<Store>Products()` function
2. Exporting it from `src/lib/scrapers/index.ts`
3. Wiring it into both `api/search/route.ts` and `api/products/route.ts`

### Key Conventions

- `HardwareCategory` is a union type — extend it in `types.ts` when adding categories, then add URL mappings in `api/products/route.ts`
- Installment payments ("cuotas sin interés") are first-class — `InstallmentPicker` and `PriceDisplay` handle formatting; `price-utils.ts` has ARS formatting
- Images: only `*.mlstatic.com`, `i.imgur.com`, and `images.unsplash.com` are whitelisted in `next.config.ts`
- Dark mode: `ThemeScript` is injected in root layout to avoid flash-of-wrong-theme
- Brand/category inference from product names: both `firecrawl.ts` and `store-apis.ts` have `inferBrand()` / `inferCategory()` helpers with a shared `KNOWN_BRANDS` list (not deduplicated — if updating, update both files)
