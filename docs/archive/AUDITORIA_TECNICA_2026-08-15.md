# Auditoría técnica — 2026-08-15

Alcance: seguridad, arquitectura, capa de datos/scraping, testing, frontend y SEO.
Estado base: `npm run lint` limpio, 321 unit tests en 61 archivos pasando (1.3s), E2E no ejecutados en esta auditoría.

---

## 1. Seguridad

### CRÍTICO

**S1. Bypass del gate admin de `bypassDb` vía header spoofeable `x-internal-refresh`.**
`src/lib/search/search-route-handler.ts:166-175` y `src/lib/products/products-route-handler.ts:59-68`: el check de admin para `?bypassDb=1` solo corre si el header `x-internal-refresh` NO es `1`, y ese header lo controla el cliente. Cualquier visitante puede mandar `?bypassDb=1` + `x-internal-refresh: 1` y forzar scraping en vivo de todas las tiendas por request (saltea cache y DB) — amplificación de costo/DoS contra las tiendas y contra la propia app.
Fix sugerido: firmar el refresh interno (HMAC del secret) o usar un header con valor secreto que no venga nunca del exterior (stripear el header en el edge/proxy antes de que llegue al handler).

**S2. Inyección HTML vía JSON-LD en la página de producto.**
`src/app/product/[id]/page.tsx:116-121`: `JSON.stringify` no escapa `</script>`. Los campos (`name`, `description`, `sku`, seller) provienen de datos scrapeados de tiendas externas (`src/lib/product/product-page-metadata.ts:81-159`); `normalizeDisplayText` (`src/lib/text-utils.ts:26-48`) no elimina `<` ni `</script>`. Un título scrapeado malicioso rompe el contexto del script tag e inyecta HTML pre-renderizado. La CSP con nonce (`src/app/proxy.ts:30`) mitiga la ejecución, no la inyección.
Fix sugerido: reemplazar `<` por `\u003c` (y `>`/`&`) al serializar todo JSON-LD, no solo el de producto (`guia/[slug]`, `comparativa/[slug]`, `layout.tsx` usan el mismo patrón con contenido curado).

### MEDIO

- **S3.** Comparación de CRON secret no timing-safe: `src/lib/admin/catalog-refresh/access.ts:16,19` usa `===` en vez de `crypto.timingSafeEqual`.
- **S4.** Rate limit solo en `/api/search` y `/api/products`. Sin límite: `/api/categories`, `/api/stores`, `/api/home/sections` (query a Supabase por request) y POST `/api/auth/session`.
- **S5.** `getRequestIp` (`src/lib/server/rate-limit.ts:83-94`) confía en `x-forwarded-for`/`x-real-ip` spoofeables fuera de Vercel; el bucket `'unknown'` agrupa a todos los clientes sin IP.
- **S6.** CSP duplicada y contradictoria: `vercel.json` emite una CSP permisiva (`unsafe-inline`, `connect-src https: wss:`) que convive con la estricta de `src/app/proxy.ts`. Triple superposición de security headers (next.config.ts / vercel.json / proxy.ts) — frágil. Unificar.
- **S7.** CSRF leve: GET de `/api/admin/catalog-refresh` dispara el refresh completo; la cookie admin es `sameSite: 'lax'` (se envía en navegación top-level cross-site).
- **S8.** `POST /api/auth/session` (`src/app/api/auth/session/route.ts:27-40`) persiste en cookie cualquier accessToken sin validarlo contra Supabase en ese momento (la validación ocurre después).

### BAJO / OK

- `X-XSS-Protection` deprecado (`next.config.ts:36`, `proxy.ts:53`).
- `src/lib/server/cors.ts` es código muerto (nadie lo usa) y setea `*` sin `Vary: Origin`.
- Verificado sin hallazgos: los 4 endpoints `/api/admin/*` validan auth (cookie admin vía `app_metadata` no falsificable o bearer); RLS correcto en tablas de usuario; sin secrets hardcodeados ni fugados al bundle (`server-only` en supabase-server); sin SSRF en scrapers (URLs hardcodeadas + `encodeURIComponent`); validación de inputs de búsqueda correcta.

---

## 2. Arquitectura y calidad de código

### ALTO

- **A1.** Cliente Supabase creado sin genérico `Database` (`src/lib/server/supabase-server.ts:61,83`, `src/lib/supabase.ts`): toda la persistencia es `any` encubierto, compensado con casts `as DbProductRow[]` por todo el código. `src/lib/supabase/generated-types.ts` (503 líneas) está desactualizado (faltan `user_profiles`, `user_favorites`, `price_alerts`) y **nadie lo consume**. Tipos de filas definidos 3 veces con derivas.
- **A2.** `ScraperResult<T>` (`ok()`/`fail()`) adoptado solo por 2 de 15 scrapers (mexx, venex); el resto devuelve `Product[]` plano y degrada errores a `[]`. 40 patrones `.catch(() => ...)` que tragan errores; los framework scrapers ni siquiera pasan por telemetría (`src/lib/search/search-live.ts:91-96`).
- **A3.** Registry de scrapers adoptado a medias: `products-list-service.ts` y `products-detail-service.ts` importan 16-17 scrapers individualmente y duplican el mapeo store→scraper que ya vive en `SCRAPER_BY_ID`.
- **A4.** Duplicación entre scrapers: `CATEGORY_SEARCH_TERMS` copiado en 7 archivos; helpers locales (`parseArsPrice` ×10, `cleanName` ×7, `slugify` ×10, `extractBrand` ×14, `inferStock` ×11) pese a que `scraper-helpers.ts` ya los exporta; 3 listas de marcas divergentes; patrón backoff-429 copiado en 6 archivos; dos utilidades de concurrencia idénticas (`lib/async/concurrency.ts` vs `scrapers/multi-store.ts:21-43`).
- **A5.** Código muerto confirmado (0 importadores): `lib/ai/normalize/database.ts` (duplicado byte-a-byte dentro de `index.ts`), `lib/scrapers/index.ts`, `lib/supabase/types-index.ts`, `lib/server/cache-health.ts`, `lib/server/cors.ts`, `lib/metrics/index.ts`, `lib/seo/comparison-content.ts`, endpoint `/api/home/sections` (huérfano). Además 14 exports muertos en `price-utils.ts` (~190 líneas).

### MEDIO

- **A6.** Capa persistence importa `@/lib/scrapers/static-data` — los datos estáticos de tiendas viven dentro de la carpeta de scraping y 3 componentes cliente terminan importando desde `scrapers/`.
- **A7.** `home-sections.ts` consulta `price_history` directo con el cliente **service** (secret key) para una lectura, saltándose persistence; además el payload reporta `fallbackUsed: false` cuando hubo un tercer fallback vía `push` (líneas 349, 372).
- **A8.** `HomePageClient.tsx` (463 líneas): rama `!staticMode` muerta (`app/page.tsx:22-29` siempre pasa `staticMode={true}`), 6 props fantasma, `SectionTitle` e `hydrateProducts` duplicados localmente, data de categorías/comparativas/guías inline que duplica `seo/comparisons-data` y `seo/budget-guides-data`. El bloque client podría reducirse a SearchBar + vistos recientemente.
- **A9.** 50 `console.*` fuera de tests pese a existir `logger.ts` — incluidos módulos server core con 0 logger (`redis-cache.ts`, `shared-cache.ts`, `rate-limit.ts`, `supabase-server.ts`) y 6 scrapers sin trazabilidad de errores.
- **A10.** `product-catalog.ts` calcula cada firma dos veces (líneas 275→325 y 299→351); la primera pasada se sobreescribe.

### BAJO

- `'use client'` redundante en `SpecsTable`, `SyncTimestamp`, `PriceSummary`, `ProductImage`.
- `@supabase/supabase-js` viaja en el primer JS de todas las páginas (`Navigation.tsx:7` instancia el cliente en módulo aunque el usuario no use auth).

---

## 3. Capa de datos y scraping

- **D1 (MEDIO-ALTO). Retención de `price_history` no automatizada.** El cleanup (`14d raw / 90d hourly / 365d daily`) solo corre vía `mode=cleanup-history` del endpoint, y el workflow de GitHub Actions solo dispara `mode=full` diario (`.github/workflows/catalog-refresh.yml:92`). Si nadie lo corre manual, la tabla crece sin techo.
- **D2 (MEDIO). Escrituras multi-tabla sin transacción.** `persistProductsSnapshot` (`product-catalog.ts:376-404`) hace upsert de products → stores → product_prices → insert de price_history en pasos separados; un fallo a mitad deja estado parcial (mitigado por dedupe de firmas en la próxima pasada). Positivo: batches de 250/500, no N+1.
- **D3 (MEDIO). Lock de refresh solo en memoria.** `inFlightRefreshes` (`internal-refresh.ts`) y el backoff 429 por tienda (Maps en memoria) no sobreviven entre instancias serverless — refreshes solapados posibles desde instancias distintas. El catálogo-refresh no tiene lock de ningún tipo (impacto bajo: la persistencia es idempotente por firma; el costo es quota desperdiciada contra las tiendas).
- **D4 (MEDIO). `deleteRedisPattern` usa `redis.keys()`** (`redis-cache.ts:106`) pese a que el propio comentario dice que Upstash REST no lo soporta; si falla, el catch lo traga y la invalidación por scope (`clearScopeCache`) nunca ocurre → cache stale hasta expiración de TTL. `KEYS` además es O(keyspace) y caro.
- **D5 (MEDIO). `incrWithExpiry` no es atómico** (`redis-cache.ts:129-131`): si el proceso muere entre `incr` y `expire`, el contador queda sin TTL → lockout de rate limit permanente para esa clave.
- **D6 (BAJO). El "rate limit de 2s entre requests" documentado en AGENTS.md no existe en el código** — lo real es: timeout por scraper 25s (`search-handler-shared.ts:12`), concurrencia global máx 6, timeouts internos de 20s por fetch (mexx) y backoff 30min ante 429 en 4 scrapers. Doc desactualizada.
- Positivo: índices exhaustivos (búsqueda trgm, home perf, historial compuesto), sanitización/filtrado antes de normalizar, persistencia con timeout (7s) fire-safe.

---

## 4. Testing

- **T1 (ALTO).** Sin tests unitarios en: `persistence/product-read.ts` (orquestador de `/product/[id]`), `persistence/product-catalog.ts` (write path del catálogo), todo `lib/ai/normalize/**` (9 archivos), todo `lib/metrics/**` (10 archivos), `lib/client/auth.ts` + session-sync, services de products/search (solo cubiertos indirectamente vía mocks de ruta), `internal-refresh`, `background-refresh`, `cache-warming`, `admin/product-cleanup`, `catalog-refresh/access.ts`.
- **T2 (ALTO).** Test de login E2E tautológico: `e2e/auth-flow.spec.ts:37-40` (`expect(hasError || url.includes('/auth')).toBe(true)` pasa casi siempre). Sin E2E de flujos admin autenticados, OAuth callback, favoritos ni alertas.
- **T3 (MEDIO).** Scrapers sin test de parsing propio: foxtienda, prestashop, qloud, tiendanube, woocommerce, compragamer-catalog.
- Positivo: unit tests 100% aislados (fetch y Supabase siempre mockeados); 12 specs E2E con buen cubrimiento de home, búsqueda, detalle, responsive y errores.

---

## 5. Frontend, SEO y performance

- **F1 (MEDIO).** `/about` y `/acerca` duplicadas y ambas indexables en el sitemap (`seo/public-sitemap.ts:14-23`), sin canonical ni redirect.
- **F2 (MEDIO).** Páginas admin sin `robots: noindex` en metadata (`admin/page.tsx:6-9` y subpáginas) — solo las protege robots.txt, que no evita indexación por enlaces externos.
- **F3 (MEDIO).** Sitemap: tope silencioso de 5000 productos (`seo/sitemap.ts:36` `.range(0, 4999)`) y re-ejecución de la query completa con join por página paginada.
- **F4 (MEDIO).** `<img>` crudo en `ProductCard.tsx:146-159` y `ProductImage.tsx:43-53` (hosts no whitelisted) sin optimización ni placeholder; el `onError` que hace `display='none'` deja el card sin imagen.
- **F5 (BAJO).** `ProductCard.tsx:118`: `if (!surface || !position) return;` descarta analytics para `position === 0`.
- **F6 (BAJO).** robots.txt: regla `allow: '/search?category='` inefectiva (robots.txt no soporta query strings); sitemap index anidado redundante. JSON-LD: `Organization.logo` no cuadrado; `sku`/`mpn` pueden serializarse como `''`.
- **F7 (BAJO).** Tipografía pixel-art `text-[7px]/[8px]` en mayúsculas (`ProductCard`, `StoresList`) — ilegible, aunque es estética deliberada.
- Positivo: hidratación bien manejada (recently-viewed en `useEffect`, tema con `useSyncExternalStore`, `suppressHydrationWarning`), lucide-react con imports nombrados (tree-shaking OK), cheerio nunca en bundle cliente, GA4 `afterInteractive` correcto.
- **F8 (OPS).** `docs/archive/PERFORMANCE_REPORT.md` desactualizado: lista Redis/Upstash como pendiente cuando ya está implementado; además indica que la migración de 7 índices (`20260501120000`) hay que aplicarla manualmente en Supabase — verificar que esté aplicada.

---

## Plan sugerido (por prioridad)

### P0 — Seguridad (inmediato)
1. Cerrar bypass de `bypassDb` (S1): stripear/validar `x-internal-refresh` + firmar refresh interno.
2. Escapar `<`/`>` en serialización JSON-LD (S2).
3. `crypto.timingSafeEqual` para CRON secret (S3).
4. Rate limit en las rutas públicas restantes (S4).

### P1 — Riesgo operativo
5. Agendar `cleanup-history` en el workflow (semanal) o gatillarlo al final del `full` diario (D1).
6. Fix de `deleteRedisPattern` (usar nombres versionados de scope en vez de KEYS) y `incrWithExpiry` atómico (D4, D5).
7. Unificar headers/CSP en un solo lugar (S6).

### P2 — Deuda estructural
8. Migrar clientes Supabase al genérico `Database` regenerado y eliminar los 3 sets de tipos manuales (A1).
9. Adoptar `ScraperResult` + `runObservedStoreScrape` en los 13 scrapers restantes; reemplazar `.catch(() => [])` silenciosos por fail() logueado (A2).
10. Consolidar helpers de scrapers (CATEGORY_SEARCH_TERMS, parseArsPrice, backoff, concurrencia) (A3/A4).
11. Borrar código muerto: 7 archivos + 14 exports de price-utils + endpoint huérfano (A5).
12. `HomePageClient`: extraer datos estáticos a los módulos seo/* y eliminar rama muerta (A8).

### P3 — Testing y SEO
13. Tests para product-read, product-catalog, ai/normalize, catalog-refresh/access (T1).
14. Reescribir test de login E2E (T2); noindex en admin (F2); decidir `/about` vs `/acerca` (F1).
15. Mover persistence/client components fuera de `lib/scrapers/static-data` (A6) y logger en server core (A9).
