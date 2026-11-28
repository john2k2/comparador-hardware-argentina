# Espaciado de ofertas agotadas en la cola adaptativa

Estado: propuesta, revisión 3 (28/11/2026).
- **Decidido:** la meta de cobertura se redefine como componentes con stock (opción 2), decisión de Jonathan del 28/11/2026. El cambio de métrica ya está implementado (migración `20261128060000_coverage_components_with_stock.sql` y tablero).
- **Pendiente:** el espaciado de la cola sigue sin implementar hasta tener la medición previa en el VPS y `EXPLAIN` de los reclamos.

## Problema

La cola adaptativa revisa cada oferta según su categoría, sin mirar el stock:

| Motivo (`reason`) | Intervalo |
|---|---|
| `tracked` (favoritos y alertas) | 3 h |
| `analytics` (interés real) | 20 h |
| `components` | 20 h |
| `build-support` (gabinetes, refrigeración) | 72 h |
| `maintenance` | 168 h |

- **Dónde se define:** la vista vigente `catalog_refresh_policy`, en `supabase/migrations/20261008231520_adaptive_component_window_20h.sql:5-24`.
- **Cuándo se reclama una oferta:** `claim_catalog_refresh` (`20261001190514_optimize_adaptive_claims.sql:2-36`) y `claim_catalog_feed_refresh` (`20261002141712_reconcile_shared_source_contracts.sql:5-40`) la toman cuando `last_updated <= now() - interval_hours`.
- **Por qué los agotados vuelven tan seguido:** `persist_adaptive_offer` fija `last_updated` en la fecha de observación sea cual sea el stock (`20261002143236_bind_observed_listing_identity.sql:37-38`). Un componente agotado hace meses se pide de nuevo cada 20 h, igual que uno con stock.

**El tope:** cada corrida admite 2.500 ofertas, contando intentadas y diferidas. En la corrida 46096902325 hubo 2.119 intentadas y 381 diferidas, con `limitReached: true`, según el artefacto `catalog-adaptive-46096902325`. El paso de barrido duró unos 12 de los 17 minutos disponibles, así que hoy limita el tope, no el tiempo.

**Ejemplo, Dinobyte:** su Store API pública (28/11/2026, 04:45 UTC) informó, por la cabecera `X-WP-Total`:
- 20 productos `instock`;
- 3.707 `outofstock`;
- 2.176 `onbackorder` ("Disponible para reserva").

La respuesta no se guardó. Para repetirla: `curl -sD - -o /dev/null "https://dinobyte.ar/wp-json/wc/store/v1/products?per_page=1&stock_status=outofstock"`. Según los artefactos de las corridas 46096645827 y 46096902325, cada una le dedicó 340 y 347 ofertas, con 0 y 2 precios comparables.

**Dato que falta:** cuánto del tope se va en todas las tiendas a componentes agotados hace una semana o más. Lo responde la medición previa. Si el resultado es chico, esta propuesta se archiva.

## Propuesta: sólo cambiar la vista

Sin columna nueva, sin trigger y sin carga inicial. En `catalog_refresh_policy` se agrega una rama **después** de `tracked` y `analytics` y antes de `components`:

```sql
when pp.stock = 'out-of-stock'
  and q.category in ('procesadores','tarjetas-graficas','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion')
  and not exists (
    select 1 from public.price_history ph
    where ph.product_id = pp.product_id and ph.store_id = pp.store_id
      and ph.offer_url = pp.url and ph.recorded_at > now() - interval '7 days')
then 72   -- reason 'unavailable'
```

**Por qué equivale a "agotado hace 7 días o más":**
- Todos los escritores insertan historial sólo cuando cambia el precio o el stock: `persist_adaptive_offer`, `persist_priority_offer`, `persist_requested_offer` y `persist_catalog_offers`.
- El historial crudo cubre 14 días, más que la ventana de 7, así que la compactación no la afecta.
- La consulta usa el índice existente `(product_id, store_id, offer_url, recorded_at desc)` (`20260824174500_catalog_integrity_and_offer_history.sql:60`).

**Lo que ya no hace falta resolver:** la variante anterior agregaba `out_of_stock_since`. Obligaba a definir qué pasaba al pasar por `unknown`, cómo cargar fechas iniciales desde historial compactado y cómo hacer un `UPDATE` masivo. Esta variante no tiene nada de eso.

**Reglas:**
- Favoritos, alertas e interés de Analytics conservan 3 h y 20 h, aunque estén agotados.
- Aplica sólo a componentes. Gabinetes y refrigeración ya están en 72 h, y mantenimiento en 168 h.
- `unknown`, incluidas las reservas de Dinobyte, queda afuera, porque también sale de lecturas ambiguas.
- Un agotamiento nunca se infiere por vencimiento ni por ausencia. Sólo se espacia lo que se observó agotado y no cambió en una semana.

**Costo de rendimiento:** una búsqueda en el índice por cada componente agotado, en cada lectura de la vista. La vista se lee en cada reclamo (unas 50 llamadas por corrida) y en `catalog_refresh_coverage`. Antes de elegir esta variante hay que medirla en el VPS con `EXPLAIN (ANALYZE, BUFFERS)` sobre los dos reclamos. Si resulta cara, se vuelve a la variante con columna y trigger.

## Efecto sobre el reclamo

- El cuarto del lote (`greatest(1, p_limit / 4)`, 12 de 48) es un **piso reservado** para `interval_hours > 24`, no un tope.
- Las ofertas `unavailable` de 72 h van a competir por ese piso con `build-support` (72 h) y con el mantenimiento real (168 h). El orden es `store_rank`, que se parte por tienda y por `interval_hours > 24`, y después `last_attempt_at`.
- En la fase de feed, que admite hasta 1.200 ofertas, los agotados de Dinobyte comparten carril con el mantenimiento de CompraGamer, MaxTecno y Golden Tech.
- Lo que se libera son lugares en el carril de 20 h, para componentes con stock. A cambio, el mantenimiento puede atrasarse, y eso se mide después.

## Costo aceptado

- Si un componente sin interés, agotado y sin cambios desde hace una semana se repone, lo detectamos hasta 72 h después en vez de 20 h.
- No se muestra ningún precio incorrecto: lo que falta durante ese lapso es un precio nuevo.
- Sólo adelantan la detección las búsquedas en vivo (`persist_catalog_offers`) y el reclamo adaptativo. El inventario diario no sirve para esto: sólo registra altas y presencia (`src/lib/catalog/inventory-discovery.ts:79-84`, `20261002003210`), no stock.

## Cobertura: la decisión pendiente

El techo de cobertura en 24 h baja. Si `u` es la fracción de componentes que pasa a `unavailable`, esas ofertas se observan como mucho una vez cada 72 h, y la cobertura máxima posible en 24 h queda cerca de `(1 - u) + u / 3`. Con u = 30 %, el techo es del 80 %, y la meta del 95 % deja de ser alcanzable con el criterio actual.

Había dos salidas honestas. **Se eligió la 2** (28/11/2026):

1. **Mantener la meta tal como está** (componentes observados en 24 h, con los agotados incluidos) y aceptar que el número baja. Conviene si la meta mide frescura de todo el catálogo.
2. **Redefinir la meta** como "componentes con stock observados en 24 h", anunciando el cambio con fecha, tamaño del conjunto excluido y nueva ventana de siete días, como se hizo con la pausa de tiendas. Conviene si la meta mide precios útiles para comprar. `scripts/catalog-freshness-report.mjs:30-32` ya cuenta sólo `in-stock`/`low-stock`, así que esta definición tiene precedente.

Lo que no se puede hacer es ninguno de estos dos atajos:
- Dejar que el tablero muestre sólo `components`. Hoy `readCatalog` (`src/lib/measurement/providers.ts:214`) filtra `reason === 'components'`. Con la rama nueva, los agotados saldrían del denominador y el porcentaje subiría sin una sola observación nueva.
- Calcular la meta sobre `within_policy`.

Con cualquiera de las dos salidas, la implementación tiene que:
- Hacer que `readCatalog` sume `components` y `unavailable`, o los muestre por separado con su rótulo, según la opción elegida.
- Actualizar `src/lib/measurement/providers.test.ts:205` y `scripts/measurement-fixture-server.mjs:37`, y agregar un test que falle si `unavailable` queda afuera sin rótulo.
- Registrar en `AGENTS.md` la fecha de despliegue, el tamaño de `unavailable` y la opción elegida.

## Medición previa (sólo lectura, en el VPS)

```sql
-- Denominador: todas las ofertas intentadas en 24 h, de todos los motivos.
-- Numerador: componentes agotados que no cambiaron en 7 días (los que la propuesta espaciaría).
-- Nota: last_attempt_at cuenta ofertas intentadas al menos una vez, no intentos.
with p as (
  select v.offer_id, v.reason, v.last_attempt_at, pp.stock, pp.product_id, pp.store_id, pp.url, v.store_id s
  from public.catalog_refresh_policy v join public.product_prices pp on pp.id = v.offer_id
)
select
  count(*) filter (where last_attempt_at > now() - interval '24 hours') attempted_24h_all,
  count(*) filter (where last_attempt_at > now() - interval '24 hours' and reason = 'components' and stock = 'out-of-stock'
    and not exists (select 1 from public.price_history ph where ph.product_id = p.product_id and ph.store_id = p.store_id
      and ph.offer_url = p.url and ph.recorded_at > now() - interval '7 days')) attempted_24h_spaced,
  count(*) filter (where reason = 'components') components_total,
  count(*) filter (where reason = 'components' and stock = 'out-of-stock'
    and not exists (select 1 from public.price_history ph where ph.product_id = p.product_id and ph.store_id = p.store_id
      and ph.offer_url = p.url and ph.recorded_at > now() - interval '7 days')) components_spaced
from p;
```

- **Umbral:** se avanza sólo si `attempted_24h_spaced / attempted_24h_all` supera el 15 %.
- **Techo de cobertura:** `u = components_spaced / components_total` da el techo nuevo de la opción 1.
- **Por tienda:** repetir la consulta agrupando por `s` muestra dónde se concentra el efecto.

## Pruebas

**SQL**, archivo nuevo en `supabase/tests/`, agregado a `.github/workflows/verify.yml`. Tiene que comprobar que:
- la vista asigna 72 h y `unavailable` sólo a componentes `out-of-stock` sin historial en 7 días;
- un cambio reciente en el historial lo devuelve a 20 h;
- `tracked` y `analytics` siempre ganan;
- `unknown` no se espacia;
- las tiendas pausadas no aparecen.

**Unit:** `readCatalog` incluye `unavailable` según la opción elegida.

## Despliegue y reversión

- **La migración:** compara `pg_get_viewdef('public.catalog_refresh_policy')` con la definición vigente revisada y aborta si difiere, como en antecedentes anteriores con md5. Después recrea la vista.
- **Cómo se aplica:** con `psql -X -v ON_ERROR_STOP=1` en el VPS, fuera del minuto 41.
- **Verificación en las primeras corridas:**
  - aparecen filas `unavailable` en `coverage`;
  - `components` baja en la misma cantidad;
  - suben los intentos sobre componentes con stock;
  - la edad de `last_attempt_at` de `maintenance` y `build-support`, por tienda, no se dispara frente a la corrida anterior.
- **Revertir:** recrear la vista con la definición anterior. No queda nada más para deshacer.
