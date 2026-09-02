# GEO Content Quality & E-E-A-T Analysis — comparador-hardware.com.ar

Date: 1 September 2026 (live fetch of production)

## Content Score: 45/100

Below Average (40–54). Week-1 GEO work made a few paragraphs safer to quote. It did not create an author, a working public contact channel, original published research, or external authority. Hardware price comparison sits next to a purchase decision, so Trustworthiness is scored on dated, attributable, accurate claims.

## E-E-A-T Breakdown

| Dimension | Score | Key Finding |
|---|---|---|
| Experience | 12/25 | Live ARS/store facts exist; no first-hand hardware testing; price index is empty; no case studies |
| Expertise | 11/25 | Specs language is mostly competent; no named expert; template FAQs and unsourced FPS |
| Authoritativeness | 3/25 | Organization schema and a catalog hub exist; no press, `sameAs`, or inbound citation proof |
| Trustworthiness | 14/25 | HTTPS, legal pages, and commercial disclosure help; live site has no public email and several claim mismatches |

## Topical Authority Modifier: +5

Developing cluster: 7 comparativa slugs, 3 guía slugs, 10 category landings, product sitemaps, plus `/indice-precios-hardware`. Not +10: editorial depth is thin, several hubs are keyword lists, and the price index has no published series.

## Pages Analyzed

| Page | Word Count | Readability | Heading Structure | Citability Rating |
|---|---|---|---|---|
| https://www.comparador-hardware.com.ar/ | ~850 (listings-heavy; citation block 80) | Fernández-Huerta ~63 on the citation block | Warn | High |
| https://www.comparador-hardware.com.ar/acerca | ~370 | FH ~40 on editorial copy | Warn | Medium |
| https://www.comparador-hardware.com.ar/contacto | ~285 | FH ~55–60 | Warn | Low |
| https://www.comparador-hardware.com.ar/privacidad | ~325 | Legal Spanish; FH ~45–55 | Warn | Medium |
| https://www.comparador-hardware.com.ar/terminos | ~335 | Similar to privacy | Warn | Medium |
| https://www.comparador-hardware.com.ar/comparativa | ~285 | Keyword strings drag readability | Warn | Low |
| https://www.comparador-hardware.com.ar/guia | ~440 | FH ~55 on how-to copy | Warn | Medium |
| https://www.comparador-hardware.com.ar/indice-precios-hardware | ~120 | FH ~66 on methodology | Pass (content) | Medium |
| https://www.comparador-hardware.com.ar/llms.txt | ~70 unique | n/a | n/a | Medium |
| https://www.comparador-hardware.com.ar/comparativa/rtx-4060-vs-rx-7600 | ~385 | FH ~59–78 | Warn | Medium |
| https://www.comparador-hardware.com.ar/guia/pc-gamer-1-millon | ~510 | FH ~60 on stock/price lines | Warn | Medium |
| Product 5500X3D (featured on home) | ~560 | FH ~52–60 | Warn | High |
| `/search?category=procesadores` | ~220 editorial + listing chrome | FH ~60 on intro | Warn | Medium |

Readability note: English Flesch on Spanish copy under-scores (more syllables per word). Fernández-Huerta / INFLESZ on sampled paragraphs landed roughly 40–78 (standard to fairly easy). Fit for Argentine PC shoppers is acceptable when paragraphs stay short.

Sitewide heading issue: `layout.tsx` footer uses four content-level `h2`s (“Comparador Hardware”, “Categorias”, “Tiendas”, “Informacion”). Every page therefore fails a strict single-outline test. Content `h1` is unique and usually correct.

Repo slug counts that feed production hubs: **7** comparativas, **3** guías, **10** category landings.

## E-E-A-T Detailed Findings

### Experience

12/25. The commercial experience is operational (a working comparator), not editorial experience. That distinction matters when an AI cites *advice* (which GPU, which build) versus *today’s listed price*.

| Signal | Points | How it scored |
|---|---|---|
| First-person accounts | 3/5 | We-voice on `/acerca` (“Indexamos productos, agrupamos coincidencias”). No “we tested this card at 1440p” narrative. |
| Original research or data | 3/5 | Unique live store prices. The original-research vehicle (`/indice-precios-hardware`) is empty: “Todavía no hay suficientes datos… No mostramos estimaciones ni valores de relleno.” |
| Case studies | 0/4 | None. |
| Screenshots / artifacts of use | 1/3 | Merchant product photos, not lab or test artifacts. |
| Specific examples | 3/4 | Named stores and ARS figures on product pages. The 4060 vs 7600 slug currently has zero in-stock examples. |
| Process demonstration | 2/4 | Index methodology is the strongest process write-up. Scraping/grouping is one paragraph. Guía hub says prices update “semanalmente” without a matching public cadence. |

### Expertise

11/25. Vocabulary is mostly right. Nobody owns a recommendation, and several SKU pages ship category boilerplate.

| Signal | Points | How it scored |
|---|---|---|
| Author credentials | 0/5 | No named person. Metadata author is the brand. No Person JSON-LD. |
| Technical depth | 3/5 | Socket, TDP, DLSS, FSR, AM4/AM5 appear and are mostly used correctly. Depth stops at spec sheets plus generic tips. |
| Methodology | 3/4 | Index: median of daily min in-stock price, base 100, 365-day cap, survival bias. Comparisons honestly say performance comes from third-party benches. Guides do not. |
| Data-backed claims | 2/4 | Prices are data. FPS and “25–30% más rápida” style claims in comparison copy are unsourced. |
| Industry terminology | 3/3 | Generally correct. Internal inconsistency: RTX 4060 con lists a 128-bit bus; RX 7600 pro lists the same 128-bit bus as an advantage. |
| Author page | 0/4 | `/acerca` is a project page, not an expert bio. |

`src/lib/product/product-seo-content.ts` injects the same CPU FAQs onto every processor. On a 5500X3D titled `S/VIDEO C/COOLER`, the page still says integrated graphics are ideal for iGPU builds and that cooler inclusion “depende del modelo específico.”

### Authoritativeness

3/25. Machines can *find* the site. Nothing yet shows that others treat it as a source.

| Signal | Points | How it scored |
|---|---|---|
| Inbound citations from authorities | 0/5 | Not observable on-site. |
| Press / quotes | 0/4 | None. |
| Awards | 0/3 | None. |
| Speaker credentials | 0/3 | None. |
| Published in respected outlets | 0/4 | None. |
| Comprehensive topic coverage | 3/3 | Catalog + 7 vs pages + 3 guides + 10 categories covers Argentine hardware shopping, not GPU architecture or market history. |
| Wikipedia / `sameAs` | 0/3 | Organization JSON-LD has name, url, logo. No `sameAs`, no founder. Email omitted when `SUPPORT_EMAIL` is unset. |

Brand is consistent: “Comparador Hardware Argentina” on live pages, `SITE_NAME`, and `llms.txt`. `HardwareAR` is logo/alternateName, not the public brand.

### Trustworthiness

14/25. Scored strictly because this is purchase-adjacent.

| Signal | Points | How it scored |
|---|---|---|
| Contact (address / phone / email) | 0/4 | Live `/contacto`: “Canal de correo pendiente de configuracion publica.” No phone, no address. |
| Privacy policy | 2/2 | Present and linked. Copy still reads pre-launch. |
| Terms of service | 1/1 | Present; the page itself says it is not a professional legal review. |
| HTTPS | 2/2 | Valid HTTPS on fetched URLs. |
| Editorial / corrections policy | 1/3 | `/acerca` “CRITERIO EDITORIAL” is implicit standards. No corrections log. Contacto admits no SLA. |
| Transparent business model | 3/3 | Independent; no commissions; `CommercialDisclosure` in the footer; product disclaimer matches. |
| Reviews / testimonials | 0/3 | None. |
| Accurate claims | 2/4 | Good: no winner without in-stock offers on 4060 vs 7600; index refuses filler. Bad: guía hub “benchmarks reales” with no source; “contactanos para ayuda personalizada” with no working channel; index H1 asks what happened this week while the page has no series; product FAQs ignore SKU flags. |
| Affiliate / sponsorship disclosure | 3/3 | Disclosure exists even though sponsorship is hypothetical. Compact footer type is 8–9px: present, not prominent. |

## Content Quality Issues

1. **Keyword-as-body on `/comparativa`.** Live strings such as `rtx 4060 vs rx 7600 4060 vs 7600 argentina mejor placa video 1080p` are not paragraphs. Same pattern on `/guia` cards (`pc gamer 1 millon pc gamer barata argentina`).
2. **Template product FAQs.** Category boilerplate does not bind to parsed attributes (cooler included, iGPU, VRAM). Unsafe to quote for a named SKU.
3. **Guía FPS vs stock gate.** Hub copy claims “benchmarks reales con juegos populares en 2026.” Guide FAQs can refuse FPS when CPU/GPU are out of stock. Those two voices can appear on the same journey.
4. **Empty index vs newsy H1.** “Qué pasó con el precio del hardware esta semana” over-promises. Methodology copy underneath is honest.
5. **Footer `h2`s** flatten every page outline for extractors that concatenate headings.
6. **Word-count floors (skill).** About (~370) is near the 300 floor. Contact (~285) is thin. Comparativa hub (~285) is an index, not an article. Index (~120) is honest but not a publishable dataset page yet. Comparison (~385) and $1M guide (~510) sit well below the 1,500 blog / 2,000 pillar floors.
7. **Comparativa intro still generic when prices are missing.** After the good out-of-stock sentence, copy continues “La diferencia de precio… puede llegar a ser significativa” with no numbers.
8. **Layout keywords** still include stale tokens such as “RTX 4090 precio”.

## AI Content Concerns

Assessment: **Likely Human-Edited AI** on hubs, comparativas, and product intros. **Operational / human** on live prices and the index empty state.

| Indicator | Found? | Evidence |
|---|---|---|
| Generic phrasing | Yes | “una de las decisiones más comunes para gamers argentinos en 2026”; “el cerebro de tu PC”; “columna vertebral de tu PC” |
| Lack of specifics | Partial | Prices and stores are specific; performance advice is not |
| No original data | Partial | Catalog prices yes; index empty; no benches |
| Perfect structure, empty substance | Yes | Product H2s + FAQs that do not depend on the SKU |
| Hedging overload | Mild | Appropriate hedges on prices; overused on FAQs (“Depende del modelo específico”) |
| No authorial voice | Yes | Brand we-voice only; no editor who owns a recommendation |
| Keyword stuffing | Yes | Comparativa hub keyword lines; guía card keyword lines |
| Filler | Yes | Comparison intros that restate “compará antes de comprar” |

High-quality exceptions to keep: independence paragraph; out-of-stock winner suppression; index methodology + no-filler empty state; stock-aware guía totals when they render.

## Freshness Assessment

| Page | Published | Last Updated | Status |
|---|---|---|---|
| / | Not visible | Not visible | Current listings, undated prose |
| /acerca | Not visible | Not visible | No date |
| /contacto | Not visible | Not visible | No date |
| /privacidad | Not visible | Not visible | No date (copy still “pre-launch”) |
| /terminos | Not visible | Not visible | No date |
| /comparativa | Not visible | Not visible | No date |
| /guia | Not visible | “2026” in copy only | No date |
| /indice-precios-hardware | Not visible | Would use `snapshot.updatedAt`; currently empty | Honest empty |
| /comparativa/rtx-4060-vs-rx-7600 | Not visible | Live prices: none in stock | Current stock status, undated article |
| Product pages | Not visible | `ACT: dd/mm hh:mm` on the product chrome | Current |
| Category search | Not visible | Listing-dependent | Current / noisy |

Time sensitivity is **high** (ARS hardware prices). Missing `datePublished` / `dateModified` on editorial URLs is a citability gap. Product `ACT` is the only human-visible freshness signal found.

## Citability Assessment

### Most Citable Passages

1. Home: “Comparador Hardware Argentina es un comparador independiente de precios de hardware entre tiendas argentinas. No vendemos componentes ni cobramos la compra: mostramos precio, disponibilidad y el enlace a cada comercio.” (80 words, standalone, brand + function + non-merchant.)
2. Index: “Para cada día reconstruimos la última cotización conocida de cada oferta que sigue vigente y tenía stock. Elegimos el menor precio por producto y luego calculamos la mediana…”
3. Index limits: “Existe sesgo de supervivencia… El historial registra cambios, no capturas completas, y conserva como máximo 365 días.”
4. Comparison slug: “Hoy no hay ofertas en stock para comparar el precio de estos modelos.” + “acá el dato propio es el precio en tiendas argentinas con stock.”
5. `/acerca` editorial rule: “Cuando una ficha parece duplicada, ambigua o mezcla variantes incompatibles, preferimos marcarla como trabajo en curso antes que mostrar una falsa equivalencia.”

### Least Citable Pages

1. **`/contacto`** — tells crawlers nobody is reachable.
2. **`/comparativa` hub** — keyword lists, no facts.
3. **`/indice-precios-hardware` as a market story** — methodology is citable; the H1 question is not answerable today.
4. **Product FAQs** — interchangeable across SKUs; unsafe to quote for a named CPU.
5. **Guía hub FPS claim** — “benchmarks reales” without a source, plus “contactanos” with no email.

## Improvement Recommendations

### Quick Wins

1. Set public `SUPPORT_EMAIL` and render it on `/contacto`, `/privacidad`, and Organization `contactPoint`.
2. Remove visible keyword dumps on `/comparativa` and guía cards; keep one-sentence blurbs.
3. Change the index H1 while `status === 'empty'` (methodology-first title).
4. Gate guía FPS tables on in-stock CPU+GPU, same rule as stock-aware FAQs. Drop “benchmarks reales” unless a named source is linked.
5. Bind product FAQs to parsed attributes, or drop FAQs that the SKU already answers (cooler included, no iGPU).
6. Demote footer headings so they stop competing with page `h2`s.
7. Add a visible `Actualizado` on comparativa, guía, and index (ISO date in text and JSON-LD).
8. Expand `llms.txt` with the independence paragraph, the methodology URL, and “no winner without in-stock offers.”
9. Fix the 4060/7600 128-bit pro/con contradiction.

### Content Gaps

- AM4 vs AM5 / DDR4 vs DDR5 as a **platform cost** article using live motherboard + RAM baskets.
- How grouping / canonical IDs work (error taxonomy: duplicate, variant mix, broken price).
- Public quality report: percent in-stock, stale minutes, stores scraped — original data the index is supposed to become.
- PSU wattage, GPU length, socket/cooler compatibility with sources.
- Corrections log for misgrouped products.
- Author / editor identity if a human will stand behind build recommendations.

### Author/E-E-A-T Improvements

- Name an editor (or “equipo de catálogo”) with a bio page, Person schema, and `sameAs` if profiles exist.
- Do not claim real-world benchmarks without linking the bench. Cite a named source or drop FPS.
- Keep the independence + no-commission line; make the disclosure readable (not 8px-only).
- Treat wrong-category listings and template-FAQ mismatches as trust incidents, not SEO chores.
- Ship the price index only with dates, CSV, and a non-empty series. That is the shortest path to Experience 16+ and some original-data authority.
