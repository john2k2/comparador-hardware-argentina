# Auditoria Integral y Plan de Ejecucion

Ultima actualizacion: 2026-03-07
Estado general: En progreso

## Como usar este documento
- `- [ ]` Pendiente
- `- [~]` En progreso
- `- [x]` Completado
- `- [!]` Bloqueado

Regla de trabajo:
1. No cerrar una tarea sin evidencia (archivo cambiado, endpoint validado o test).
2. Si aparece un bloqueo, marcar `- [!]` y anotar el motivo en "Registro de avances".
3. Siempre actualizar este archivo al terminar cada bloque de trabajo.

## Hallazgos Prioritarios (Base de auditoria)

### Criticos
- [x] `A-01` Admin expuesto sin auth y potencialmente indexable.
  - Estado actual: panel/admin APIs protegidos con auth admin server-side y `noindex` en admin.
  - Referencias:
    - `src/app/api/admin/operational/route.ts`
    - `src/app/admin/page.tsx`
    - `src/app/layout.tsx`

- [x] `A-02` Riesgo de seguridad en capa Supabase server (uso de `NEXT_PUBLIC_*` en server) + falta de RLS/policies explicitas en migraciones.
  - Estado actual: cliente server-only activo, migracion RLS aplicada en proyecto real y policies verificadas (public read solo en catalogo). Variables server `SUPABASE_URL` + `SUPABASE_ANON_KEY` configuradas localmente para evitar fallback `NEXT_PUBLIC_*`.
  - Referencias:
    - `src/lib/supabase.ts`
    - `src/lib/server/supabase-server.ts`
    - `supabase/migrations/20260304183000_initial_argen_prices_schema.sql`
    - `supabase/migrations/20260305203000_catalog_rls_hardening.sql`

- [~] `A-03` Cualquier cliente puede forzar scraping caro (`bypassDb=1`) sin rate limiting.
  - Estado actual: bypass restringido a admin + rate limit en memoria por IP (falta version distribuida para multi-instancia).
  - Referencias:
    - `src/app/api/search/route.ts`
    - `src/app/api/products/route.ts`

### Altos
- [x] `A-04` Busqueda por categoria/tienda sin `q` queda vacia por contrato actual de `/api/search`.
  - Estado actual: `search` soporta intencion por filtros sin `q` (DB-first) y la UI envia `category/stores/min/max/sort` al backend.
  - Referencias:
    - `src/app/api/search/route.ts`
    - `src/app/search/page.tsx`
    - `src/app/page.tsx`

- [x] `A-05` Normalizacion IA procesa muy pocos titulos por request y gran parte cae en fallback heuristico.
  - Estado actual: se aumento cobertura por request, se agrego concurrencia por lotes en Gemini y se elimino fallback silencioso con metricas por request (fallback rate + origen memoria/DB/Gemini + validacion de persistencia en cache DB).
  - Referencias:
    - `src/lib/ai/normalize-products.ts`

- [x] `A-06` `withTimeout` no aborta requests reales; solo deja de esperar.
  - Estado actual: timeout abortable aplicado con `AbortController` en search/products + normalizador Gemini + scrapers principales.
  - Referencias:
    - `src/lib/async/with-abort-timeout.ts`
    - `src/lib/ai/normalize-products.ts`
    - `src/app/api/search/route.ts`
    - `src/app/api/products/route.ts`

- [~] `A-07` Amplificacion de escrituras en DB (persistencia frecuente de snapshots + historial).
  - Estado actual: dedupe contra estado persistido en DB con firmas (`content_signature` / `state_signature`) + heartbeat de frescura cada `12h`; `updated_at` ya no se pisa cuando solo refresca `last_seen_at` / `last_updated`.
  - Referencias:
    - `src/app/api/search/route.ts`
    - `src/lib/persistence/product-catalog.ts`
    - `src/lib/persistence/product-write-dedupe.ts`
    - `supabase/migrations/20260307103000_catalog_write_signatures.sql`

- [x] `A-08` SEO limitado por alto uso client-side en Home/Search/Product.
  - Estado actual: Home, Search y Product ya exponen wrappers server-first con metadata/robots correctos y HTML inicial con contenido real enlazable; `/search?category=...` indexa, `/search?q=...` queda `noindex`.
  - Referencias:
    - `src/app/page.tsx`
    - `src/app/search/page.tsx`
    - `src/app/product/[id]/page.tsx`
    - `src/components/home/HomePageClient.tsx`
    - `src/components/search/SearchPageClient.tsx`
    - `src/components/functional/ProductCard.tsx`
    - `src/components/functional/ProductGrid.tsx`
    - `src/lib/search/search-state.ts`

- [x] `A-09` `sitemap.xml` estatico desactualizado (slugs/categorias no alineadas).
  - Estado actual: sitemap dinamico implementado en App Router con rutas estaticas + categorias + productos desde DB, y se elimino el `public/sitemap.xml` legacy que generaba conflicto en runtime.
  - Referencias:
    - `src/app/sitemap.ts`
    - `src/lib/types.ts`

- [x] `A-10` Metadata referencia `og-image.png` inexistente.
  - Estado actual: metadata social usa `og-image.svg` existente en `public/`.
  - Referencias:
    - `src/app/layout.tsx`
    - `public/`

### Medios
- [x] `A-11` `lint` global no confiable (incluye `tmp/` y scripts debug).
  - Estado actual: `eslint.config.mjs` ignora `tmp/` y scripts de debugging/smoke fuera del app runtime.
  - Referencias:
    - `eslint.config.mjs`
    - `tmp/`

- [x] `A-12` Falta de tests automatizados en logica critica (agrupacion/ranking/paginacion).
  - Estado actual: cobertura unitaria activa para identidad/ranking/paginacion + e2e browser para `search -> detail -> back` con scroll restore.
  - Referencias:
    - `package.json`
    - `vitest.config.ts`
    - `playwright.config.ts`
    - `src/lib/product-identity.test.ts`
    - `src/lib/search/search-state.test.ts`
    - `src/lib/search/search-ranking.ts`
    - `src/lib/search/search-ranking.test.ts`
    - `src/lib/search/search-pagination.ts`
    - `src/lib/search/search-pagination.test.ts`
    - `e2e/search-navigation.spec.ts`

- [x] `A-13` Caches en memoria por proceso (inconsistentes en multi-instancia/serverless).
  - Estado actual: `search` y `product detail` usan cache compartido en Supabase y el rate limit publico ya es distribuido via RPC; los `inFlight*` locales quedan solo como dedupe optimista por instancia, no como fuente principal de consistencia.
  - Referencias:
    - `src/app/api/search/route.ts`
    - `src/app/api/products/route.ts`
    - `src/lib/telemetry/operational-metrics.ts`
    - `src/lib/server/shared-cache.ts`
    - `src/lib/server/rate-limit.ts`
    - `supabase/migrations/20260306182000_shared_cache_and_rate_limits.sql`

- [x] `A-14` Links del footer apuntan a query params en home que no siempre impactan el resultado esperado.
  - Estado actual: links de categorias/tiendas en footer ahora apuntan a `/search?...`.
  - Referencia:
    - `src/app/layout.tsx`

- [ ] `A-15` Costo de render alto por overlays/animaciones globales.
  - Referencia:
    - `src/app/globals.css`

## Plan por Fases

## Fase 1 - Seguridad y Control de Costo (Urgente)
- [x] Proteger `/admin` y `/api/admin/*` con auth.
- [x] Marcar admin como no indexable.
- [x] Separar cliente Supabase server-safe (service role en server, no `NEXT_PUBLIC_*`).
- [x] Definir y aplicar RLS + policies para tablas criticas.
- [x] Limitar `bypassDb` a uso interno.
- [x] Agregar rate limit en `/api/search` y `/api/products`.
- [x] Separar cliente Supabase server-safe (lectura server + service role para escritura server).
- [x] Definir RLS/policies para catalogo y cache de normalizacion (migracion aplicada y verificada en DB).

### Criterio de cierre Fase 1
- [x] Acceso admin bloqueado sin credenciales.
- [x] Endpoints publicos no permiten bypass no autorizado.
- [x] Policies de DB activas y verificadas (migracion aplicada y pruebas anon/auth ejecutadas).

## Fase 2 - Calidad de Busqueda y Agrupacion
- [x] Corregir flujo sin `q` (categoria/tienda).
- [x] Enviar filtros reales al backend (category/stores/min/max/sort).
- [x] Mejorar pipeline IA:
  - [x] Mayor cobertura por request.
  - [x] Menor fallback silencioso.
  - [x] Persistencia de normalizaciones validada.
- [~] Endurecer clave canonica de agrupacion por tipo de producto y variante.
- [x] Verificar casos reales reportados (ej: MSI Shadow 2X OC RTX 5060).

### Criterio de cierre Fase 2
- [ ] Mismo modelo en distintas tiendas se agrupa en una sola card.
- [ ] No se fusionan variantes distintas por error.

## Fase 3 - Performance y Persistencia
- [~] Reemplazar timeouts por abort real (`AbortController`).
- [~] Reducir escrituras innecesarias en `products/product_prices/price_history`.
- [x] Definir retencion/limpieza de `price_history`.
- [x] Paginacion server-side real para reducir payload.

### Criterio de cierre Fase 3
- [ ] Menor latencia p95 en `/api/search`.
- [ ] Menos costo de DB por request.

## Fase 4 - SEO Tecnico y de Contenido
- [x] Migrar sitemap estatico a `src/app/sitemap.ts` dinamico.
- [x] Corregir metadata social (`og-image` real).
- [x] Implementar metadata por producto (title/description/canonical/og/twitter).
- [x] Agregar JSON-LD (`Product`, `Offer`, `Organization`).
- [x] Revisar `robots` final.

### Criterio de cierre Fase 4
- [x] URLs clave indexables con metadata correcta.
- [ ] Sitemap alineado al estado real del sitio.

## Fase 5 - Calidad Operativa
- [x] Ajustar lint para ignorar `tmp/` y archivos de debugging.
- [ ] Crear tests unitarios (normalizacion, ranking, dedupe).
- [ ] Crear tests e2e (paginacion + volver desde detalle).
- [ ] Definir alertas de salud operativa (latencia, fallos por tienda, uso fallback IA).

### Criterio de cierre Fase 5
- [ ] Pipeline CI de calidad estable (lint + tests).
- [ ] Dashboard operativo con alertas utiles.

## Registro de avances

### 2026-03-05
- [x] Se creo el documento maestro de auditoria y plan.
- [x] Se implemento pagina de auth para usuarios (`/auth`) con:
  - login por email/password
  - registro por email/password
  - login con Google OAuth
  - callback dedicado (`/auth/callback`)
- [x] Se agrego estado de sesion en navegacion (login/logout visible).
- [x] Se agrego migracion base para perfiles/favoritos/alertas con RLS:
  - `user_profiles`
  - `user_favorites`
  - `price_alerts`
- [x] Se creo cuenta admin inicial en Supabase Auth y se marco `is_admin=true` en app metadata.
  - Email admin: `admin@comparador-hardware.com`
  - Login por password validado contra Supabase Auth (token OK).
- [x] Se protegieron rutas admin:
  - Guard server-side para `/admin/*` con chequeo de `is_admin`.
  - `/api/admin/operational` ahora exige token admin (cookie o bearer).
  - `admin` marcado `noindex`.
- [x] Se endurecio `bypassDb=1`:
  - `/api/search` y `/api/products` ahora rechazan bypass para no-admin.
  - refresh interno sigue permitido con header `x-internal-refresh: 1`.
- [x] Se agrego rate limit en endpoints publicos:
  - `/api/search`: `30 req/min` por IP.
  - `/api/products`: `50 req/min` por IP.
  - respuesta con `429`, `Retry-After` y headers `X-RateLimit-*`.
- [~] Pendiente conectar UI de favoritos y alertas en cards/detalle.
- [~] Fase 1 en progreso.

### 2026-03-05 (Sesion UI/UX + Busqueda/Detalle)
- [x] Se aplico fondo parallax de dia (modo claro) y se corrigio stacking/z-index para que renderice correctamente.
  - Archivos: `src/app/layout.tsx`, `src/app/globals.css`
- [x] Se implemento fondo nocturno pixel-art completo (modo oscuro):
  - estrellas parallax, luna, estrellas fugaces, cometa y nubes dark.
  - Archivos: `src/app/layout.tsx`, `src/app/globals.css`
- [x] Se corrigio error CSS de llaves duplicadas que rompia compilacion (`Unexpected }` en `globals.css`).
- [x] Se resolvio warning React por key duplicada (`thegamershop`) en detalle:
  - dedupe de precios por tienda antes de renderizar lista de tiendas.
  - Archivo: `src/app/product/[id]/page.tsx`
- [x] Se hizo polish visual de Home y Cards para mejorar legibilidad y jerarquia:
  - cards con mejor precio mas visible, CTA comparador, spacing y densidad de bordes ajustados.
  - Archivos: `src/components/functional/ProductCard.tsx`, `src/components/functional/ProductGrid.tsx`, `src/app/page.tsx`
- [x] Se ajusto copy para posicionar el producto como comparador (no vendedor):
  - textos de home, card y detalle alineados a "comparar y derivar a tienda".
  - Archivos: `src/app/page.tsx`, `src/components/functional/ProductCard.tsx`, `src/app/product/[id]/page.tsx`
- [x] En seccion "Bajaron de precio" se movio el dato de baja a cada card:
  - ahora muestra `BAJO $X (Y%)` por producto cuando aplica.
  - Archivos: `src/components/functional/ProductCard.tsx`, `src/app/page.tsx`
- [x] Se reforzo la pagina de detalle con enfoque comparador-first:
  - bloque "RESUMEN COMPARADOR" (tiendas, diferencia, ahorro maximo, rango),
  - CTA de tiendas `VER EN TIENDA`,
  - badge de actualizacion (`ACT: dd/mm hh:mm`).
  - Archivo: `src/app/product/[id]/page.tsx`
- [x] Se implemento normalizacion de texto para corregir caracteres raros/mojibake en UI:
  - util central `normalizeDisplayText`.
  - aplicado en cards y detalle (nombre, marca, descripcion, specs, tiendas).
  - Archivos: `src/lib/text-utils.ts`, `src/components/functional/ProductCard.tsx`, `src/app/product/[id]/page.tsx`
- [x] Validacion tecnica de los cambios:
  - `eslint` en archivos tocados OK.
  - `npm run build` OK en los checkpoints finales.

### 2026-03-05 (Continuidad Home + Saneado Backend)
- [x] Se definio regla final de "Bajaron de precio" en modo estricto 24h reales:
  - origen exclusivo: `price_history` (sin fallback snapshot).
  - filtros activos: ventana 24h, minimo `5%` o `ARS 10.000`.
  - Archivos: `src/app/api/home/sections/route.ts`, `src/app/page.tsx`
- [x] Se aplico saneado de texto en backend para cortar mojibake de origen antes de persistir y responder:
  - modulo central: `src/lib/product-sanitizer.ts`
  - aplicado en APIs y persistencia/lectura DB:
    - `src/app/api/search/route.ts`
    - `src/app/api/products/route.ts`
    - `src/lib/persistence/product-catalog.ts`
    - `src/lib/persistence/product-read.ts`
- [x] Validacion tecnica del bloque:
  - `npx eslint` en archivos tocados OK.
  - `npm run build` OK.
- [x] Se implemento rate limit server-side por IP para control de costo:
  - modulo: `src/lib/server/rate-limit.ts`
  - aplicado en:
    - `src/app/api/search/route.ts`
    - `src/app/api/products/route.ts`
  - notas:
    - excepcion para refresh interno (`x-internal-refresh: 1`)
    - limite actual en memoria de proceso (no distribuido).
- [x] Mejora UX de busqueda en `/search`:
  - estado visual claro de busqueda en curso (`ESCANEANDO TIENDAS...`).
  - estado de "sin resultados" con mensaje accionable y botones:
    - `LIMPIAR FILTROS`
    - `REINTENTAR BUSQUEDA`
  - estado inicial "listo para buscar" cuando no hay query/filtros.
  - Archivo: `src/app/search/page.tsx`
- [x] Mejora de agrupacion para CPUs equivalentes (caso Ryzen 5700 duplicado por variaciones de titulo):
  - clave canonica por modelo CPU (`ryzen7-5700`, `ryzen7-5700x`, `ryzen7-5700g`, etc.).
  - dedupe difuso de CPUs sin requerir misma tienda/precio cuando el modelo coincide.
  - ajuste adicional: excluir combos/bundles (`pc gamer`, `combo`, `kit`, etc.) de la clave canonica CPU para evitar fusion incorrecta con CPUs puros.
  - ajuste adicional: contexto de query en normalizacion IA + soporte de sufijos (`GT/GE`) para no mezclar variantes cercanas.
  - ampliado a criterio global:
    - clave de identidad estricta compartida para CPU/GPU/motherboard.
    - misma logica aplicada en `/api/search` y en lectura DB para evitar discrepancias.
    - mayor cobertura IA por request (`GEMINI_MAX_BATCHES_PER_REQUEST`, default 8 batches).
    - ampliacion "todo producto":
      - identidad generica por marca/modelo/familia para perifericos y accesorios (teclados, mouse, monitores, audio, webcam, etc.).
      - nivel soft para agrupacion inicial y nivel estricto para dedupe seguro.
      - prompt IA actualizado para exigir agrupacion estricta tambien en perifericos.
  - aplicado en:
    - `src/lib/product-identity.ts`
    - `src/lib/ai/normalize-products.ts`
    - `src/app/api/search/route.ts`
    - `src/lib/persistence/product-read.ts`

### 2026-03-05 (Auditoria de scrapers + optimizacion de busqueda)
- [x] Validacion tecnica de parametros de busqueda por tienda (smoke HTTP con query `ryzen 5600`):
  - `Mexx` -> `200` + contenido con marker esperado.
  - `Venex` -> `200` + contenido con marker esperado.
  - `FullH4rd` -> `200` + contenido con marker esperado.
  - `Maximus` -> `200` + `hidWebSiteID` presente.
  - `Gezatek` -> `200` + contenido con marker esperado.
  - `Compugarden` -> `200` + contenido con marker esperado.
  - `CompraGamer` -> catalogo API estatico responde y filtra query correctamente.
- [x] Optimizacion en `/api/search`:
  - si hay filtro de tiendas, ahora solo se ejecutan scrapers de esas tiendas (antes corria todo y luego filtraba).
  - pre-filtro por tokens de query antes de normalizacion IA para bajar carga/costo y latencia.
  - soporte de filtro de tiendas tambien para bloque WooCommerce (solo tiendas Woo seleccionadas).
  - archivos:
    - `src/app/api/search/route.ts`
    - `src/lib/scrapers/woocommerce.ts`
- [x] Ajuste de matching en `/api/products` cuando hay `q`:
  - se reemplazo el filtro literal (`includes(query completa)`) por matching por tokens + score simple de relevancia.
  - reduce falsos negativos en busquedas con orden/variantes de titulo.
  - archivo:
    - `src/app/api/products/route.ts`
- [x] Benchmark comparativo de latencia ejecutado (`sin filtro` vs `con filtro de tiendas`) con delta p50/p95 documentado.

### 2026-03-05 (Fase 1 - Supabase server-safe + RLS catalogo)
- [x] Se implemento cliente Supabase `server-only` para backend:
  - lectura server: `getServerSupabaseReadClient()`
  - escritura server (service role): `getServerSupabaseServiceClient()`
  - fallback controlado y warning si faltan variables server.
  - archivo: `src/lib/server/supabase-server.ts`
- [x] Se migraron modulos server criticos al cliente server-only:
  - persistencia catalogo: `src/lib/persistence/product-catalog.ts`
  - lectura DB de productos: `src/lib/persistence/product-read.ts`
  - cache IA de titulos: `src/lib/ai/normalize-products.ts`
  - auth admin server: `src/lib/server/admin-auth.ts`
  - home sections (`price_history`): `src/app/api/home/sections/route.ts`
  - APIs de listas basicas:
    - `src/app/api/categories/route.ts`
    - `src/app/api/stores/route.ts`
- [x] Se agrego migracion de hardening RLS para catalogo:
  - habilita RLS en `stores`, `categories`, `products`, `product_prices`, `price_history`, `product_title_normalizations`.
  - agrega politicas de lectura publica solo para `stores/categories/products/product_prices`.
  - mantiene `price_history` y `product_title_normalizations` sin lectura publica por defecto.
  - archivo: `supabase/migrations/20260305203000_catalog_rls_hardening.sql`
- [x] Validacion tecnica:
  - `eslint` en archivos tocados OK.
  - `npm run build` OK.
- [x] Cierre total completado en entorno real:
  - migracion `catalog_rls_hardening` aplicada en `zyiyziubpcpgoqlkcrie`.
  - RLS activo en `stores/categories/products/product_prices/price_history/product_title_normalizations`.
  - politicas publicas solo en `stores/categories/products/product_prices`.
  - prueba por rol:
    - `anon/authenticated`: lectura OK en tablas de catalogo.
    - `anon/authenticated`: `price_history` y `product_title_normalizations` devuelven `0` filas (sin policy de lectura).

### 2026-03-05 (Fase 2 + Fase 3 - flujo sin q + timeout abortable)
- [x] Se corrigio `A-04` en API + UI:
  - `/api/search` ya no exige `q` cuando hay intencion por filtros (`category/stores/min/max`).
  - `SearchPage` ahora envia filtros reales al backend (`q/category/stores/minPrice/maxPrice/sortBy`).
  - cache cliente de `/search` ahora se indexa por querystring completa, no solo por `q`.
  - archivos:
    - `src/app/api/search/route.ts`
    - `src/app/search/page.tsx`
- [x] Se avanzo `A-06` con abort real:
  - helper comun `withAbortTimeout` + `withPromiseTimeout`.
  - aplicado en `/api/search` y `/api/products` para scrapers y refresh internos.
  - aplicado en Gemini normalizer con `config.abortSignal`.
  - scrapers principales aceptan `AbortSignal` opcional (Mexx/Venex/FullH4rd/Maximus/Gezatek/Compugarden/CompraGamer/WooCommerce + descripcion de producto).
  - archivos:
    - `src/lib/async/with-abort-timeout.ts`
    - `src/app/api/search/route.ts`
    - `src/app/api/products/route.ts`
    - `src/lib/ai/normalize-products.ts`
    - `src/lib/scrapers/*.ts` (tiendas principales + extractor de descripcion)
- [x] Se avanzo `A-05` (cobertura IA):
  - `GEMINI_MAX_BATCHES_PER_REQUEST` sube default a `16` (tope `40`).
  - normalizacion por lotes ahora corre con concurrencia controlada (`GEMINI_BATCH_CONCURRENCY`, default `2`).
  - se reduce probabilidad de fallback por limite artificial de throughput.
  - archivo: `src/lib/ai/normalize-products.ts`
- [x] Validacion tecnica:
  - `npx eslint` en archivos tocados OK.
  - `npm run build` OK.
  - migracion aplicada en Supabase real `argen-prices-db` (`zyiyziubpcpgoqlkcrie`) como `20260305204550 add_perifericos_category`.
  - verificacion SQL:
    - `categories`: existe `perifericos`.
    - `products`: `perifericos=530`, `procesadores=311`, `tarjetas-graficas=904`.
  - smoke API local posterior:
    - `/api/search?q=mouse%20logitech` -> `MOUSE_CATEGORIES=perifericos`.
    - `/api/search?category=perifericos` -> `174` resultados, todas en `perifericos`.
- [~] Riesgo pendiente:
  - `withPromiseTimeout` mantiene timeout de operaciones no abortables (ej: persistencia DB), controlado por diseno para no bloquear request.

### 2026-03-05 (Cierre A-02 - RLS aplicado en Supabase real)
- [x] Se aplico migracion de hardening RLS en proyecto real `argen-prices-db` (`zyiyziubpcpgoqlkcrie`):
  - migracion registrada en DB: `20260305185523 catalog_rls_hardening`.
- [x] Verificacion de estado DB:
  - `rls_enabled = true` en: `stores`, `categories`, `products`, `product_prices`, `price_history`, `product_title_normalizations`.
  - policies presentes solo en lectura publica de catalogo:
    - `catalog_read_stores`
    - `catalog_read_categories`
    - `catalog_read_products`
    - `catalog_read_product_prices`
  - sin policy de lectura para:
    - `price_history`
    - `product_title_normalizations`
- [x] Prueba efectiva por rol:
  - `set role anon` / `set role authenticated`:
    - tablas catalogo -> devuelven filas.
    - `price_history` y `product_title_normalizations` -> `0` filas (aisladas por RLS).
- [x] Ajuste de entorno server local:
  - se agregaron `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `.env.local` para eliminar fallback server a `NEXT_PUBLIC_*`.
  - `npm run build` sin warning de fallback.
- [~] Riesgos residuales fuera de `A-02`:
  - `security advisors` reporta:
    - `rls_enabled_no_policy` INFO en tablas privadas (esperado por diseno).
    - `auth_leaked_password_protection` WARN.

### 2026-03-05 (Fase 5 - confiabilidad de lint)
- [x] Se cerro `A-11` ajustando ignores de ESLint:
  - se excluyo `tmp/**`.
  - se excluyeron scripts locales de debugging/smoke fuera del runtime (`debug-*.js`, `test-*.js`, `test*.mjs`, `take_screenshots.mjs`).
  - archivo: `eslint.config.mjs`
- [x] Validacion tecnica:
  - `npm run lint` OK.

### 2026-03-05 (SEO/UX - metadata social + footer links)
- [x] Se cerro `A-10`:
  - `openGraph.images` y `twitter.images` ahora usan `/og-image.svg` existente.
  - archivo: `src/app/layout.tsx`
- [x] Se cerro `A-14`:
  - links de footer para categorias/tiendas pasan de `/?...` a `/search?...` para impactar resultados de forma consistente.
  - archivo: `src/app/layout.tsx`
- [x] Validacion tecnica:
  - `npx eslint src/app/layout.tsx` OK.
  - `npm run build` OK.

### 2026-03-05 (SEO tecnico - sitemap dinamico)
- [x] Se cerro `A-09` con sitemap dinamico en App Router:
  - nuevo `src/app/sitemap.ts`.
  - incluye rutas estaticas principales + categorias de busqueda + productos recientes desde DB (`products`).
  - se removio `public/sitemap.xml` legacy para evitar conflicto de enrutado (`public file` vs `app route`).
  - evita desalineacion de slugs/categorias frente al sitemap estatico legado.
- [x] Validacion tecnica:
  - `npx eslint src/app/sitemap.ts` OK.
  - `npm run build` OK (ruta `/sitemap.xml` generada).
  - smoke browser OK en `http://localhost:3000/sitemap.xml`.

### 2026-03-05 (Performance DB - dedupe de escrituras de precio)
- [~] Se avanzo `A-07` para bajar amplificacion de escrituras:
  - `persistProductsSnapshot` ahora guarda firma por `product_id|store_id|url`.
  - si precio/stock/cuotas no cambiaron, evita:
    - upsert redundante en `product_prices`
    - insercion redundante en `price_history`
  - archivo: `src/lib/persistence/product-catalog.ts`
- [x] Validacion tecnica:
  - `npx eslint src/lib/persistence/product-catalog.ts` OK.
  - `npm run build` OK.

### 2026-03-05 (Smoke browser end-to-end)
- [x] Validacion manual en navegador local (`http://localhost:3000`) de cambios del bloque:
  - busqueda con query (`/search?q=...`) responde y renderiza cards.
  - estado `SIN RESULTADOS` visible con query inexistente.
  - busqueda sin `q` funciona por filtros:
    - `/search?category=procesadores` (carga + resultados).
    - `/search?stores=mexx&minPrice=...&maxPrice=...` (request real a `/api/search?...` sin `q`).
  - estado inicial `/search` sin filtros muestra `LISTO PARA BUSCAR`.
  - metadata social valida en DOM (`og:image` y `twitter:image` -> `/og-image.svg`).
  - `sitemap.xml` valida en browser tras eliminar conflicto con archivo publico legacy.
- [x] Hallazgo detectado y corregido en el acto:
  - conflicto `public/sitemap.xml` + `src/app/sitemap.ts` rompia `/sitemap.xml` en runtime.
  - accion: eliminar `public/sitemap.xml`.

### 2026-03-05 (Fase 2 - cierre pipeline IA + verificacion caso real)
- [x] Se cerro `A-05` con trazabilidad operativa de normalizacion IA:
  - nuevo resultado detallado `normalizeProductTitlesWithStats` con:
    - `fallbackRatePct` por request
    - origenes (`memory/db/gemini/fallback`)
    - razones de fallback (`no_ai`, `quota_backoff`, `deferred_budget`, `batch_error`)
    - validacion de persistencia en DB (`dbUpsertAttempted` vs `dbUpserted`)
  - API `/api/search` ahora registra resumen de normalizacion en `note` de telemetria endpoint (`NORM_FB_*`, `NORM_GEM_*`, `NORM_DB_*`) y warnings explicitos cuando hay fallback/persistencia parcial.
  - archivos:
    - `src/lib/ai/normalize-products.ts`
    - `src/app/api/search/route.ts`
- [~] Endurecimiento adicional de identidad generica:
  - se removieron stopwords que ocultaban variantes (`pro/plus/ultra/max`, `wireless/inalambrico`) para evitar fusiones incorrectas en perifericos.
  - archivo:
    - `src/lib/product-identity.ts`
- [~] Verificacion de caso reportado:
  - smoke API `GET /api/search?q=msi shadow 2x oc rtx 5060` -> `200`, `5` grupos.
  - evidencia observada:
    - grupo separado para `RTX 5060 8GB MSI SHADOW 2X OC`
    - grupo separado para variantes `RTX 5060 Ti` (8GB / 16GB), sin mezclar con 5060 no-Ti.
- [x] Hallazgo runtime corregido durante smoke:
  - error de `next/image` por host no permitido (`hardcorecomputacion.com.ar`) en resultados de busqueda.
  - se agrego dominio Woo faltante a `images.remotePatterns`.
  - archivo:
    - `next.config.ts`
- [x] Validacion tecnica del bloque:
  - `npx eslint src/lib/ai/normalize-products.ts src/app/api/search/route.ts src/lib/product-identity.ts` OK.
  - `npm run build` OK.

### 2026-03-05 (Benchmark de latencia `/api/search`)
- [x] Se ejecuto benchmark reproducible de latencia con scraping real (sin cache DB):
  - script: `tmp/benchmark-search-latency.mjs`
  - escenario A (`sin filtro`, `q=ryzen 5600`, `bypassDb=1`, header interno):
    - `p50: 7115ms`
    - `p95: 12606.4ms`
    - `mean: 7534.8ms`
    - `runs OK: 5/5`
  - escenario B (`con filtro`, `stores=mexx`, misma query):
    - `p50: 382.5ms`
    - `p95: 518.6ms`
    - `mean: 415.9ms`
    - `runs OK: 5/5`
  - delta (B - A):
    - `p50: -6732.5ms` (`94.6%` mejor)
    - `p95: -12087.8ms` (`95.9%` mejor)
  - evidencia completa:
    - `tmp/benchmark-search-latency-1772740874047.json`

### 2026-03-05 (Fase 2 - ajuste fino de agrupacion multi-producto)
- [~] Endurecimiento adicional de clave canonica global (`product-identity`):
  - identidad generica:
    - normalizacion de tokens fuertes con limpieza de sufijos de ruido (`usb`, `wireless`, `bluetooth`, etc.).
    - eliminacion de tokens numericos puros (evita fragmentacion por SKU/codigo interno).
    - soporte de variantes unificadas en formato separado y fusionado (`g502 x` == `g502x`).
  - identidad GPU:
    - se removio flag `oc/std` de la clave exacta para evitar split por titulos que omiten `OC`.
  - archivo:
    - `src/lib/product-identity.ts`
- [x] Ajuste de filtro por intencion de query en `/api/search`:
  - soporte de variantes de 1 caracter asociadas a modelo (`g502 x`, `5600 g`, etc.).
  - enforcement de variantes explicitas cuando la query las trae (`shadow`, `prime`, `dual`, `tuf`, `hero`, `lightspeed`, etc.).
  - archivo:
    - `src/app/api/search/route.ts`
- [x] Verificacion de casos reales (smoke API con `bypassDb=1` + `x-internal-refresh: 1`):
  - `teclado logitech k120`:
    - antes: split en `K120` + `K120 USB ...`
    - ahora: `K120` unificado (`stores=6`) y `MK120` separado como combo.
  - `mouse logitech g502`:
    - antes: `6` grupos
    - ahora: `4` grupos (fusion correcta `G502 X`/`G502X` sin mezclar con `Hero`/`Lightspeed`).
  - `mouse logitech g502 x`:
    - antes: aparecian resultados sin `X` (ej. `Hero`)
    - ahora: `1` grupo relevante (`Mouse Logitech G502 X Gaming Black`, `stores=8`).
  - `msi shadow 2x oc rtx 5060`:
    - antes: `5` grupos con contaminacion de `Ventus`
    - ahora: `3` grupos (`Shadow 5060`, `Shadow 5060 Ti 8GB`, `Shadow 5060 Ti 16GB`) sin `Ventus`.
  - `asus rtx 5060`:
    - antes: `18` grupos
    - ahora: `12` grupos (menos fragmentacion por diferencias de titulo/`OC`).
- [x] Validacion tecnica del bloque:
  - `npx eslint src/lib/product-identity.ts src/app/api/search/route.ts` OK.
  - `npm run build` OK.
- [x] Riesgo residual de taxonomia mitigado:
  - se agrego categoria `perifericos` al dominio de `HardwareCategory` + UI + APIs + scrapers.
  - se agrego migracion SQL para alta de categoria y recategorizacion heuristica de historicos mal clasificados.
  - impacto: evita que teclados/mouse/monitores queden en `tarjetas-graficas` por falta de taxonomia.

### 2026-03-05 (Taxonomia global de perifericos)
- [x] Se resolvio deuda de taxonomia `perifericos` end-to-end:
  - tipos/base:
    - `HardwareCategory` ahora incluye `perifericos`.
    - categorias estaticas incluyen `Perifericos`.
  - frontend:
    - `/search` reconoce `category=perifericos`.
    - inferencia cliente incluye perifericos y deja de caer por default en `tarjetas-graficas`.
    - footer agrega acceso rapido a `Perifericos`.
  - backend:
    - `/api/search` y `/api/products` aceptan/propagan `perifericos`.
    - inferencia de categoria ampliada para mouse/teclado/monitor/audio/webcam/joystick, etc.
    - `categoryToSearchTerm` soporta `perifericos`.
  - scrapers:
    - WooCommerce agrega slugs para perifericos.
    - CompraGamer agrega deteccion por nombre/subcategoria para perifericos.
    - inferencia de `store-apis` y `firecrawl` ampliada para perifericos.
    - config de category URLs incluye `perifericos` en fuentes legacy.
  - DB:
    - nueva migracion `20260305204550_add_perifericos_category.sql`:
      - upsert de categoria `perifericos` en `public.categories`.
      - recategorizacion heuristica de productos historicos de perifericos mal guardados como `tarjetas-graficas`/`procesadores`.
- [x] Validacion tecnica:
  - `npx eslint` en archivos tocados OK.
  - `npm run build` OK.
  - migracion aplicada en Supabase real `argen-prices-db` (`zyiyziubpcpgoqlkcrie`) como `20260305204550 add_perifericos_category`.
  - verificacion SQL:
    - `categories`: existe `perifericos`.
    - `products`: `perifericos=530`, `procesadores=311`, `tarjetas-graficas=904`.
  - smoke API local posterior:
    - `/api/search?q=mouse%20logitech` -> `MOUSE_CATEGORIES=perifericos`.
    - `/api/search?category=perifericos` -> `174` resultados, todas en `perifericos`.

### 2026-03-05 (Security advisors - search_path)
- [x] Se resolvio `function_search_path_mutable` en `public.set_updated_at`:
  - nueva migracion: `20260305205139_fix_set_updated_at_search_path.sql`.
  - la funcion ahora declara `set search_path = pg_catalog, public`.
  - migracion aplicada en Supabase real `argen-prices-db` (`zyiyziubpcpgoqlkcrie`) como `20260305205139 fix_set_updated_at_search_path`.
- [x] Verificacion post-fix:
  - `get_advisors (security)` ya no reporta `function_search_path_mutable`.
  - se mantienen solo:
    - `auth_leaked_password_protection` (WARN).
    - `rls_enabled_no_policy` (INFO esperado en tablas privadas por diseno).
- [~] Pendiente manual:
  - `auth_leaked_password_protection` no se puede activar por migracion SQL en este proyecto; requiere habilitarlo en Supabase Dashboard (`Auth > Settings > Password Security`).

### 2026-03-05 (Base DB-first + preprocesado de catalogo)
- [x] Se implemento base de catalogo preprocesado en DB:
  - nueva migracion: `20260305210426_catalog_preprocessing_fields.sql`.
  - columnas nuevas en `products`:
    - `normalized_title`
    - `canonical_product_key`
    - `family_key`
    - `variant_key`
    - `refresh_priority`
    - `last_scraped_at`
    - `last_normalized_at`
  - indices nuevos:
    - `products_canonical_product_key_idx`
    - `products_family_key_idx`
    - `products_refresh_priority_last_scraped_idx`
    - `products_normalized_title_trgm_idx`
- [x] Se movio clasificacion persistida al pipeline de ingesta:
  - nuevo modulo: `src/lib/catalog/catalog-metadata.ts`
  - `persistProductsSnapshot` ahora:
    - normaliza titulos por lote
    - calcula clave canonica/familia/variante
    - asigna `refresh_priority`
    - persiste timestamps de scrape/normalizacion
- [x] La lectura DB ahora usa esos campos:
  - `readProductsFromDatabase` selecciona y filtra tambien por `normalized_title/family_key/variant_key`.
  - dedupe DB-first prioriza `canonicalProductKey` persistido.
- [x] Se agrego endpoint admin para refresh offline:
  - `POST /api/admin/catalog-refresh`
  - soporta:
    - refresh masivo por categorias
    - refresh dirigido por `query`
  - pensado para ser llamado por cron/job externo y no depender de una busqueda de usuario.
- [x] Validacion tecnica:
  - `npx eslint` OK.
  - `npm run build` OK.
  - migracion aplicada en Supabase real `argen-prices-db` (`zyiyziubpcpgoqlkcrie`) como `20260305210426 catalog_preprocessing_fields`.
  - verificacion SQL:
    - columnas nuevas presentes en `public.products`.
    - indices nuevos presentes en `public.products`.
- [~] Pendiente para completar la arquitectura objetivo:
  - [x] scheduler/cron externo que ejecute `GET /api/admin/catalog-refresh` en ventanas programadas.
  - politica explicita de refresco:
    - [x] catalogo general cada 24h
    - [x] hot products cada 3h
    - [x] tracked products cada 30 min

### 2026-03-05 (Verificacion funcional post DB-first)
- [x] Verificacion tecnica:
  - `npm run lint` OK.
  - `npm run build` OK.
- [x] Smoke HTTP local sobre instancia activa en `:3000`:
  - `GET /search` -> `200`.
  - `GET /api/search?q=mouse%20logitech` -> `70` resultados, categorias `perifericos`.
  - `GET /api/search?category=perifericos` -> `174` resultados, categorias `perifericos`.
  - `GET /api/products?category=perifericos` -> `174` resultados, categorias `perifericos`.
  - `POST /api/admin/catalog-refresh` sin token -> `401` (auth admin aplicada correctamente).
- [x] Verificacion DB real (`zyiyziubpcpgoqlkcrie`):
  - migraciones incluyen `20260305210426 catalog_preprocessing_fields`.
  - columnas persistidas presentes en `public.products` (`normalized_title`, `canonical_product_key`, `family_key`, `variant_key`, `refresh_priority`, `last_scraped_at`, `last_normalized_at`).

### 2026-03-05 (Cron programado para refresh DB-first)
- [x] Se cerro el pendiente de scheduler para refresh de catalogo:
  - `src/app/api/admin/catalog-refresh/route.ts` ahora soporta:
    - `GET` y `POST`
    - acceso por admin o cron secret (`CRON_SECRET` / `CATALOG_REFRESH_CRON_SECRET`)
    - modos `tracked | hot | full | custom`
    - seleccion automatica de targets desde DB (`user_favorites`, `price_alerts`, `products.refresh_priority`, `last_scraped_at`)
    - fallback explicito a categorias cuando no hay targets de DB
  - `vercel.json` agregado con jobs:
    - `tracked` cada 30 min
    - `hot` cada 3 h
    - `full` diario
- [x] Documentacion actualizada en `README.md`:
  - variables de entorno para cron
  - ejemplos de ejecucion manual
  - descripcion de modos y parametros de refresh

### 2026-03-05 (Smoke real: descarga completa + validacion de busquedas)
- [x] Se ejecuto refresh completo de catalogo por endpoint admin con cron secret:
  - `GET /api/admin/catalog-refresh?mode=full`
  - resultado: `200`, `totalTargets=9`, `okTargets=9`, `failedTargets=0`.
  - auth verificada: sin credenciales devuelve `401`.
- [x] Se corrigio riesgo de cuelgue en refresh masivo:
  - timeout abortable por target interno (`90s`) en `catalog-refresh`.
  - manejo de error por target para que un fallo puntual no tumbe todo el job.
  - archivo: `src/app/api/admin/catalog-refresh/route.ts`
- [x] Verificacion de busquedas post-refresh:
  - `ryzen 5600` -> `200`, `1` resultado.
  - `mouse logitech g502` -> `200`, `2` resultados.
  - `teclado logitech k120` -> `200`, `1` resultado.
  - `asus rtx 5060` -> `200`, `2` resultados.
  - `gigabyte aorus b650` -> `200`, `3` resultados.

### 2026-03-06 (Persistencia server reactivada con service role)
- [x] Se agrego `SUPABASE_SERVICE_ROLE_KEY` al entorno local `.env.local`.
  - impacto:
    - `getServerSupabaseServiceClient()` vuelve a habilitar escrituras server-side.
    - `persistProductsSnapshot()` ya puede guardar `products`, `product_prices` y `price_history` en Supabase.
- [x] Validacion funcional:
  - `npm run build` OK con entorno actualizado.
  - `GET /api/admin/catalog-refresh?mode=custom&query=mouse%20logitech%20g502%20x&maxQueries=1` con cron secret -> `200`, `okTargets=1`, `failedTargets=0`.
  - `GET /api/search?q=mouse%20logitech%20g502%20x` -> `200`.
  - verificacion SQL directa en proyecto real `zyiyziubpcpgoqlkcrie`:
    - existe registro actualizado en `public.products` para `g502 x`
    - `updated_at` / `last_scraped_at` reflejan el refresh ejecutado el `2026-03-06`.

### 2026-03-06 (Cobertura de catalogo: paginacion y limites)
- [x] Se agrego helper comun de paginacion para scrapers HTML:
  - archivo: `src/lib/scrapers/common-pagination.ts`
  - incluye:
    - normalizacion de URLs absolutas
    - deteccion de `next page`
    - fallback a `?page=N`
    - presupuesto distinto para categoria vs busqueda
- [x] Se amplio scraping multipagina en tiendas de alto impacto:
  - `src/lib/scrapers/mexx.ts`
  - `src/lib/scrapers/venex.ts`
  - `src/lib/scrapers/fullh4rd.ts`
  - `src/lib/scrapers/woocommerce.ts`
- [x] Se ampliaron limites de lectura DB para reflejar mejor el catalogo persistido:
  - `src/lib/persistence/product-read.ts`
  - `src/app/api/search/route.ts`
  - `src/app/api/products/route.ts`
- [x] Se aumento timeout de scrapers en APIs para tolerar multipagina:
  - `src/app/api/search/route.ts`
  - `src/app/api/products/route.ts`
- [x] Validacion tecnica:
  - `npx eslint` OK en archivos tocados.
  - `npm run build` OK.
- [x] Smoke funcional local:
  - `procesadores`:
    - DB visible: `439`
    - live refresh: `604`
  - `gabinetes`:
    - DB visible: `344`
    - live refresh: `656`
  - `refrigeracion`:
    - DB visible: `337-372` segun snapshot/cache
    - live refresh: `744`
- [~] Riesgo residual:
  - DB-first sigue agrupando/compactando mas que el scrape live, por lo que el numero final visible puede quedar por debajo del bruto scrapeado.
  - aun faltaria paginacion dedicada en algunas fuentes no-HTML/API especificas si se busca cobertura total.

### 2026-03-06 (Fase 2 - hardening de identidad canonica)
- [x] Se endurecio la construccion de identidad para agrupar con contexto combinado:
  - ahora `product-identity` usa `normalizedTitle + fallback` en lugar de depender solo del titulo normalizado.
  - objetivo: evitar fusiones incorrectas cuando la normalizacion IA simplifica demasiado y omite variante/linea exacta.
  - archivo:
    - `src/lib/product-identity.ts`
- [x] Se paso contexto mas rico (`brand + model + name`) a la clave canonica y metadatos de catalogo:
  - aplica en persistencia de catalogo, lectura DB-first y respuesta live de `/api/search`.
  - archivos:
    - `src/lib/catalog/catalog-metadata.ts`
    - `src/lib/persistence/product-read.ts`
    - `src/app/api/search/route.ts`
- [x] `/api/search` ahora expone tambien metadata de agrupacion en resultados live:
  - `normalizedTitle`
  - `canonicalProductKey`
  - `familyKey`
  - `variantKey`
- [x] Evidencia puntual del ajuste:
  - titulo canonico simplificado `MSI RTX 5060 8GB` + fallback `MSI RTX 5060 Shadow 2X OC 8GB` -> clave final `shadow` (no cae en `base`).
  - `MSI RTX 5060 8GB` + fallback `MSI RTX 5060 Ventus 2X OC 8GB` -> clave final `ventus`.
  - `Mouse Logitech G502` + fallback `Mouse Logitech G502 X Gaming Black` -> conserva `g502-x`.
  - `Mouse Logitech G502` + fallback `Mouse Logitech G502 Hero` -> conserva `g502-hero`.
- [x] Validacion tecnica:
  - `npx eslint src/lib/product-identity.ts src/lib/catalog/catalog-metadata.ts src/app/api/search/route.ts src/lib/persistence/product-read.ts` OK.
  - `npm run build` OK.
- [x] Smoke API local post-ajuste:
  - `GET /api/search?q=msi%20shadow%202x%20oc%20rtx%205060&bypassDb=1` -> `4` resultados live con claves:
    - `rtx5060:8gb:msi:shadow`
    - `rtx5060ti:8gb:msi:shadow`
    - `rtx5060ti:16gb:msi:shadow`
    - bundle separado
  - `GET /api/search?q=msi%20shadow%202x%20oc%20rtx%205060` -> `4` resultados DB-first con las mismas claves canonicas.
  - `GET /api/search?q=mouse%20logitech%20g502%20x&bypassDb=1` -> `2` resultados:
    - `g502-x` exacto
    - bundle separado
- [~] Riesgo residual:
  - sigue faltando smoke E2E de browser para cerrar formalmente el criterio de Fase 2.
  - querys no-bundle como `teclado logitech k120` todavia pueden arrastrar combos en resultados bajos; hoy quedan separados por clave, pero no excluidos por intencion.

### 2026-03-06 (UX busqueda - estado de carga visible)
- [x] Se corrigio el flicker donde `/search` podia mostrar `SIN RESULTADOS` antes de terminar una busqueda nueva.
  - ahora la vista considera el cambio de criterio como `busqueda en curso` hasta resolver cache/fetch del nuevo `apiSearchKey`.
  - durante ese estado muestra `BUSCANDO...` + banner explicito de carga.
  - archivo:
    - `src/app/search/page.tsx`
- [x] Se reforzo el feedback en la barra de busqueda:
  - boton `SEARCH` pasa a `BUSCANDO...`
  - texto auxiliar debajo del input mientras se consulta
  - limpieza deshabilitada durante la carga para evitar estados ambiguos
  - archivo:
    - `src/components/functional/SearchBar.tsx`
- [x] Validacion tecnica:
  - `npx eslint src/components/functional/SearchBar.tsx src/app/search/page.tsx` OK.
  - `npm run build` OK.

### 2026-03-06 (SEO tecnico - detalle de producto + robots)
- [x] Se separo `/product/[id]` en wrapper server + componente cliente:
  - permite `generateMetadata` dinamico sin perder cache/local UX del detalle.
  - archivos:
    - `src/app/product/[id]/page.tsx`
    - `src/components/product/ProductDetailClient.tsx`
- [x] Metadata por producto implementada:
  - `title`
  - `description`
  - `canonical`
  - `openGraph`
  - `twitter`
- [x] Se agrego JSON-LD server-side para detalle:
  - `Organization`
  - `Product`
  - `Offer` por tienda
- [x] Se implemento `src/app/robots.ts` y se elimino conflicto legacy:
  - archivo removido: `public/robots.txt`
  - `robots.txt` final expone `sitemap` y bloquea `/admin`, `/api`, `/auth/callback`.
- [x] Validacion funcional:
  - `GET /robots.txt` devuelve reglas correctas.
  - HTML de `/product/[id]` incluye `canonical` y `application/ld+json`.
- [~] Riesgo residual:
  - Home/Search quedaban pendientes en este checkpoint; se cerraron mas abajo en la entrada `2026-03-06 (A-08 - Home/Search server-first real)`.

### 2026-03-06 (Hallazgo y correccion - colision de IDs agrupados)
- [x] Se detecto bug critico durante smoke SEO:
  - `/api/search` podia devolver productos distintos con el mismo `id` agrupado.
  - impacto:
    - cards distintas apuntaban al mismo detalle
    - metadata SSR podia corresponder a otro producto
    - persistencia DB podia sobrescribir un agrupado con otro
- [x] Causa raiz:
  - el `id` agrupado se armaba solo con `normalizedTitle`, sin incorporar la clave canonica final.
- [x] Correccion aplicada:
  - nuevo `buildGroupedProductId()` usa `normalizedTitle + hash(groupKey)` para mantener legibilidad y unicidad.
  - archivo:
    - `src/app/api/search/route.ts`
- [x] Evidencia:
  - query `mouse logitech g502 x` live:
    - antes: productos exactos y bundles compartian `id`
    - ahora: `NO_DUP_IDS`
  - detalle del primer resultado:
    - `title=Mouse Logitech G502 X Gaming White | Comparador Hardware Argentina`
- [x] Validacion tecnica:
  - `npx eslint src/app/api/search/route.ts src/app/product/[id]/page.tsx src/components/product/ProductDetailClient.tsx src/app/robots.ts` OK.
  - `npm run build` OK.

### 2026-03-06 (A-08 - Home/Search server-first real)
- [x] Se elimino el bailout global por `Suspense` en Home y `/search`:
  - `src/app/page.tsx` y `src/app/search/page.tsx` ahora renderizan el arbol inicial directo desde server wrappers.
- [x] `/search` dejo de depender de `useSearchParams` para construir su estado principal:
  - nuevo helper compartido `src/lib/search/search-state.ts` centraliza parseo, canonicalizacion de querystring y `apiSearchKey`.
  - `SearchPageClient` ahora sincroniza por props server + `router.replace`, no por lectura reactiva del URL hook.
- [x] Se saco la dependencia de hooks de navegacion del render de cards:
  - `ProductCard` ya no usa `usePathname` / `useSearchParams`.
  - se conserva `from=...` y restauracion de scroll pasando `returnTo` desde la pagina de busqueda.
- [x] Evidencia funcional/SEO:
  - `npx eslint src/lib/search/search-state.ts src/components/functional/ProductCard.tsx src/components/functional/ProductGrid.tsx src/components/search/SearchPageClient.tsx src/app/search/page.tsx src/app/page.tsx` OK.
  - `npm run build` OK.
  - `GET /` en `localhost:3000`:
    - HTML inicial contiene heading home.
    - HTML inicial contiene `16` links `/product/...` y `16` labels `COMPARAR TIENDAS`.
  - `GET /search?category=procesadores`:
    - title `Procesadores en Argentina`.
    - HTML inicial contiene `12` links `/product/...`.
    - no aparece `noindex`.
  - `GET /search?q=ryzen%205600`:
    - title `Busqueda: ryzen 5600`.
    - aparece `noindex`.
    - HTML inicial contiene links `/product/...`.
- [x] Impacto:
  - `A-08` queda cerrado.
  - Fase 4 sube a cierre practico en metadata/indexabilidad de URLs clave.

### 2026-03-06 (A-12 - base de tests unitarios)
- [x] Se agrego arnes de tests con `vitest`:
  - scripts nuevos:
    - `npm test`
    - `npm run test:watch`
  - archivo:
    - `vitest.config.ts`
- [x] Se cubrieron invariantes criticos de identidad canonica:
  - preservacion de variante GPU por contexto fallback (`shadow` vs `ventus`)
  - separacion de variantes cercanas en perifericos (`g502-x` vs `g502-hero`)
  - deteccion de bundles
  - archivo:
    - `src/lib/product-identity.test.ts`
- [x] Se cubrio estado/canonicalizacion de busqueda:
  - parseo y saneado de params
  - orden canonico de stores
  - `apiSearchKey` sin ruido de pagina
  - `buildSearchRoute` con `page` solo cuando corresponde
  - archivo:
    - `src/lib/search/search-state.test.ts`
- [x] Validacion tecnica:
  - `npm test` -> `8` tests OK.
  - `npm run build` OK.
- [~] Pendiente para cierre total de `A-12`:
  - e2e browser para volver desde detalle y scroll restore

### 2026-03-06 (A-12 - ranking y paginacion cubiertos)
- [x] Se extrajo la logica de ranking/intencion de query de `/api/search` a helper puro:
  - archivo:
    - `src/lib/search/search-ranking.ts`
  - impacto:
    - la API sigue usando la misma heuristica, pero ahora testeable fuera de `route.ts`.
- [x] Se agregaron tests de ranking:
  - enforcement de variantes de query (`x`, `shadow`)
  - penalizacion de bundles cuando la query no los pide
  - orden final por relevancia antes que precio cuando corresponde
  - archivo:
    - `src/lib/search/search-ranking.test.ts`
- [x] Se extrajo paginacion cliente a helper puro reutilizable:
  - archivo:
    - `src/lib/search/search-pagination.ts`
  - `SearchPageClient` ahora delega el calculo de `currentPage/totalPages/slice`.
- [x] Se agregaron tests de paginacion:
  - slice correcto por pagina
  - clamp de pagina minima/maxima
  - estado vacio estable en pagina `1`
  - archivo:
    - `src/lib/search/search-pagination.test.ts`
- [x] Validacion tecnica:
  - `npx eslint src/lib/search/search-ranking.ts src/lib/search/search-ranking.test.ts src/lib/search/search-pagination.ts src/lib/search/search-pagination.test.ts src/components/search/SearchPageClient.tsx src/app/api/search/route.ts vitest.config.ts` OK.
  - `npm test` -> `15` tests OK.
  - `npm run build` OK.
- [x] Cierre funcional de `A-12` completado posteriormente con e2e browser en la entrada `2026-03-06 (A-12 - e2e volver desde detalle)`.

### 2026-03-06 (Fase 3 - retencion/limpieza de `price_history`)
- [x] Se definio politica explicita de retencion para historial de precios:
  - conservar granularidad completa por `14` dias
  - compactar a `1` muestra por hora entre `14` y `90` dias
  - compactar a `1` muestra por dia entre `90` y `365` dias
  - purgar todo lo mas viejo que `365` dias
- [x] Se agrego funcion SQL de mantenimiento:
  - migracion:
    - `supabase/migrations/20260306174000_price_history_retention_cleanup.sql`
  - funcion:
    - `public.cleanup_price_history(interval, interval, interval)`
- [x] Se agrego wrapper server-side y modo admin/cron para ejecutarla:
  - helper:
    - `src/lib/persistence/price-history-retention-policy.ts`
    - `src/lib/persistence/price-history-maintenance.ts`
  - endpoint:
    - `GET|POST /api/admin/catalog-refresh?mode=cleanup-history`
  - cron:
    - `vercel.json` ahora programa `cleanup-history` diario a las `05:30 UTC`
- [x] Documentacion actualizada:
  - `README.md` documenta el modo nuevo y la politica aplicada.
- [x] Validacion tecnica:
  - `npx eslint src/lib/persistence/price-history-retention-policy.ts src/lib/persistence/price-history-maintenance.ts src/lib/persistence/price-history-maintenance.test.ts src/app/api/admin/catalog-refresh/route.ts` OK.
  - `npm test` -> `16` tests OK.
  - `npm run build` OK.
- [x] Validacion en Supabase real (`zyiyziubpcpgoqlkcrie`):
  - migracion `price_history_retention_cleanup` aplicada OK.
  - `select public.cleanup_price_history()` -> respuesta correcta con politica:
    - `keepRawDays=14`
    - `keepHourlyDays=90`
    - `keepDailyDays=365`
  - snapshot observado al ejecutar:
    - `beforeRows=10286`
    - `deletedRows=0`
    - `remainingRows=10286`

### 2026-03-06 (Fase 3 - paginacion server-side real en `/search`)
- [x] `/api/search` ahora pagina del lado servidor:
  - acepta `page`
  - devuelve `pagination` con:
    - `limit`
    - `offset`
    - `total`
    - `totalPages`
    - `page`
    - `pageSize`
- [x] `SearchPage` y `SearchPageClient` consumen pagina real del backend/DB:
  - el cliente ya no corta resultados locales para la navegacion principal
  - el contador superior usa `total` real, no el largo del slice actual
  - archivos:
    - `src/app/search/page.tsx`
    - `src/components/search/SearchPageClient.tsx`
    - `src/lib/search/search-api.ts`
    - `src/lib/search/search-pagination.ts`
    - `src/lib/persistence/product-read.ts`
    - `src/app/api/search/route.ts`
- [x] Evidencia funcional local:
  - `GET /api/search?category=procesadores&page=2` en `localhost:3000`:
    - `ProductCount=12`
    - `Page=2`
    - `PageSize=12`
    - `Total=529`
    - `TotalPages=45`
    - `Offset=12`
  - `GET /search?category=procesadores&page=2`:
    - HTML inicial contiene links `/product/...`
    - HTML conserva `page=2`
- [~] Riesgo residual:
  - la lectura DB paginada sigue dedupeando en app y luego cortando slice, por lo que la ganancia fuerte hoy es de payload/UI; una futura iteracion puede empujar mas de esa dedupe al lado SQL si se busca bajar tambien costo DB.

### 2026-03-06 (A-13 - cache compartido y rate limit distribuido)
- [x] Se reemplazo el cache local principal de `/api/search` por cache compartido en Supabase:
  - helper:
    - `src/lib/server/shared-cache.ts`
  - endpoint:
    - `src/app/api/search/route.ts`
- [x] Se movio tambien el cache principal de detalle de `/api/products` a Supabase:
  - endpoint:
    - `src/app/api/products/route.ts`
- [x] El rate limit publico ahora usa chequeo distribuido en DB:
  - helper:
    - `src/lib/server/rate-limit.ts`
  - funcion SQL:
    - `public.check_api_rate_limit(text, integer, integer)`
- [x] Infraestructura nueva en Supabase:
  - tabla `public.api_cache_entries`
  - tabla `public.api_rate_limits`
  - migracion:
    - `supabase/migrations/20260306182000_shared_cache_and_rate_limits.sql`
- [x] Validacion tecnica:
  - `npx eslint ...` OK en archivos tocados.
  - `npm run build` OK.
- [x] Validacion en Supabase real (`zyiyziubpcpgoqlkcrie`):
  - migracion `shared_cache_and_rate_limits` aplicada OK.
  - `select public.check_api_rate_limit('smoke:/api/search:127.0.0.1', 30, 60)` -> respuesta valida:
    - `allowed=true`
    - `remaining=29`

### 2026-03-06 (A-12 - e2e volver desde detalle)
- [x] Se agrego smoke E2E con Playwright para el flujo de navegacion mas sensible:
  - ruta inicial `/search?category=procesadores&page=2`
  - click a producto con `from=...`
  - volver con browser back
  - verificacion de scroll restaurado lejos del top
  - archivos:
    - `playwright.config.ts`
    - `e2e/search-navigation.spec.ts`
- [x] Validacion tecnica:
  - `npm run test:e2e` OK en `msedge`.
  - `npm test` -> `16` tests unitarios OK.

### 2026-03-07 (A-07 - persistencia con firmas y heartbeat)
- [x] Se reemplazo el dedupe de escrituras basado solo en memoria por comparacion contra estado persistido en Supabase:
  - `products` ahora calcula `content_signature`
  - `product_prices` ahora calcula `state_signature`
  - helper puro:
    - `src/lib/persistence/product-write-dedupe.ts`
- [x] `persistProductsSnapshot()` ahora:
  - lee el estado persistido actual por lote
  - upsertea solo filas nuevas/cambiadas
  - hace touch de frescura cada `12h` cuando no hubo cambios reales
  - inserta `price_history` solo cuando cambia el estado efectivo del precio/stock/cuotas
- [x] Se evito contaminar `updated_at` con refrescos de heartbeat:
  - nueva migracion:
    - `supabase/migrations/20260307103000_catalog_write_signatures.sql`
  - `products.updated_at` y `product_prices.updated_at` solo avanzan cuando cambia la firma real, no cuando solo se refresca metadata de observacion
- [x] Cobertura automatizada agregada:
  - `src/lib/persistence/product-write-dedupe.test.ts`
  - casos cubiertos:
    - firma estable con orden distinto de `specs`
    - skip de filas intactas dentro de la ventana de heartbeat
    - re-touch cuando la frescura expira
    - `price_history` solo ante cambio real
- [x] Validacion tecnica:
  - `npx eslint src/lib/persistence/product-catalog.ts src/lib/persistence/product-write-dedupe.ts src/lib/persistence/product-write-dedupe.test.ts src/lib/supabase.ts` OK
  - `npm test` -> `20` tests OK
  - `npm run build` OK
  - `GET http://localhost:3000/api/search?q=mouse%20logitech%20g502%20x` -> `200`, `ProductCount=1`, `Total=1`, `Page=1`
- [x] Validacion en Supabase real (`zyiyziubpcpgoqlkcrie`):
  - migracion `catalog_write_signatures` aplicada OK
  - columnas nuevas presentes:
    - `public.products.content_signature`
    - `public.product_prices.state_signature`
  - prueba transaccional de trigger:
    - touch de `products.last_seen_at` sin cambio de firma -> `updated_at` preservado
    - touch de `product_prices.last_updated` sin cambio de firma -> `updated_at` preservado

### Punto de retomada (manana)
- [x] Definir regla final de "Bajaron de precio":
  - opcion elegida: estricta 24h reales (sin fallback snapshot).
  - Archivo principal: `src/app/api/home/sections/route.ts`
- [x] Aplicar saneado de texto tambien en backend (antes de persistir/responder) para cortar mojibake de origen.
- [~] Continuar auditoria desde Fase 2 (calidad de agrupacion + pipeline IA) segun plan.

Plantilla para nuevas entradas:
- Fecha:
- Cambios:
- Evidencia:
- Riesgos pendientes:

## Proxima accion recomendada
- [x] Resolver deuda de taxonomia: categoria `perifericos` (o mapeo equivalente) para evitar clasificacion de teclados/mouse/monitores en `tarjetas-graficas`.
- [x] Ejecutar benchmark de latencia (`sin filtro` vs `con filtro de tiendas`) y anexar delta p50/p95.
- [ ] Atender advisor de seguridad restante: `auth_leaked_password_protection` (activar en Dashboard Auth).
- [x] Conectar un cron/job externo a `/api/admin/catalog-refresh` para pasar a refresh programado real DB-first.
