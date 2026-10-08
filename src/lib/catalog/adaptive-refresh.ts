import 'server-only';
import { randomUUID } from 'node:crypto';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { PRODUCT_SELECT_FIELDS } from '@/lib/persistence/product-read-helpers';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { buildPriceStateSignature } from '@/lib/persistence/product-write-dedupe';
import { reviewProductOffers } from '@/lib/ai/review-product-offers';
import { isComparableStoreOffer } from '@/lib/price-utils';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { WOO_BATCH_STORES } from '@/lib/scrapers/woocommerce-known-batch';
import { setSourceFetchConcurrency, sourceBlockedUntil, sourceHttpMetrics } from '@/lib/scrapers/source-http';
import { createStoreLanes, STORE_LANE_SKIPPED } from './store-lanes';
import { runInventoryDiscovery } from './inventory-discovery';
import { runInventoryDetailDiscovery } from './inventory-detail-discovery';
import { createKnownOfferContext, fetchKnownOffer, prepareKnownOfferBatch } from './on-demand/worker';
import { createRefreshClaimError, extractRefreshClaimDiagnostic, createRefreshSeedAttempt,
  sanitizeRefreshSeedDiagnostic, type RefreshClaimDiagnostic, type RefreshSeedAttempt } from './refresh-diagnostics';

type Target = { offer_id: string; product_id: string; store_id: string; url: string; interval_hours: number; reason: string };
type Outcome = 'observed' | 'no-observation' | 'source-failed' | 'persist-failed' | 'unsupported';
type Counts = { attempted: number; observed: number; comparable: number; failures: Record<string, number> };
type ClosureFailureCode = 'REFRESH_RELEASE_FAILED' | 'REFRESH_COVERAGE_FAILED' | 'REFRESH_PROGRESS_FAILED';
const emptyCounts = (): Counts => ({ attempted: 0, observed: 0, comparable: 0, failures: {} });
/** Solicitudes simultáneas entre tiendas distintas; cada tienda sigue siendo serial. */
export const ADAPTIVE_FETCH_CONCURRENCY = 8;
/** Separación mínima entre lecturas a una misma tienda. */
export const ADAPTIVE_STORE_SPACING_MS = 2000;
/** Lote por reclamo; las RPC de reclamo rechazan más de 60. */
export const ADAPTIVE_CLAIM_BATCH = 48;
// CompraGamer y los lotes WooCommerce comparten una lectura de catálogo; no se espacia por fila.
const isSharedReadStore = (storeId: string) => storeId === 'compragamer' || WOO_BATCH_STORES.has(storeId);
/** Detalle de inventario por ejecución; el resto del lote queda para la próxima. */
export const ADAPTIVE_INVENTORY_DETAIL_MS = 90_000;
/** Si el descubrimiento diario ya consumió esto, el detalle espera a otra ejecución. */
export const ADAPTIVE_INVENTORY_PHASE_MS = 5 * 60_000;
/** Los triggers mantienen la cola; la preparación completa es una conciliación diaria. */
export const SEED_RECONCILIATION_HOURS = 24;
export const SEED_RETRY_HOURS = 6;
/** Tope de la conciliación automática; si no termina, la próxima ejecución continúa. */
export const SEED_AUTO_MAX_MS = 3 * 60_000;
export type SeedMode = 'auto' | 'always' | 'never';
type SeedSummary = { mode: SeedMode; status: 'skipped' | 'completed' | 'partial' | 'failed'; reason?: string; code?: string };
function adaptiveSeedMode(option?: SeedMode): SeedMode {
  const configured = option ?? process.env.CATALOG_ADAPTIVE_SEED ?? 'auto';
  if (configured !== 'auto' && configured !== 'always' && configured !== 'never') throw new Error('REFRESH_INVALID_SEED_MODE');
  return configured;
}
function adaptiveConcurrency(): number {
  const configured = Number(process.env.CATALOG_ADAPTIVE_CONCURRENCY ?? ADAPTIVE_FETCH_CONCURRENCY);
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > 16) throw new Error('REFRESH_INVALID_CONCURRENCY');
  return configured;
}

export async function runAdaptiveRefresh(options: { maxOffers?: number; maxRunMs?: number; seed?: SeedMode } = {}) {
  if (process.env.CATALOG_REQUESTED_RUNNER !== '1') throw new Error('REFRESH_RUNNER_REQUIRED');
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('REFRESH_DATABASE_UNAVAILABLE');
  const requestedLimit = options.maxOffers ?? Number(process.env.CATALOG_ADAPTIVE_MAX_OFFERS ?? 2500);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 5000) throw new Error('REFRESH_INVALID_LIMIT');
  const maxOffers = requestedLimit;
  const concurrency = adaptiveConcurrency();
  const seedMode = adaptiveSeedMode(options.seed);
  const deadline = Math.min(17 * 60_000, Math.max(1000, options.maxRunMs ?? 17 * 60_000));
  const started = Date.now(), token = randomUUID(), startedAt = new Date(started).toISOString();
  // Sólo se compactan resúmenes operativos generados por esta cola.
  const cleanup = await client.from('catalog_refresh_runs').delete()
    .lt('started_at',new Date(started-30*86400000).toISOString());
  if (cleanup.error) throw new Error('REFRESH_RUN_RETENTION_FAILED');
  const interrupted = await client.from('catalog_refresh_runs').update({ status:'failed',finished_at:startedAt })
    .eq('status','running').lt('started_at',new Date(started-60*60_000).toISOString());
  if (interrupted.error) throw new Error('REFRESH_PROGRESS_FAILED');
  let inventory: Awaited<ReturnType<typeof runInventoryDiscovery>> = [];
  let inventoryDetails: Awaited<ReturnType<typeof runInventoryDetailDiscovery>> | undefined;
  let seeded = 0;
  let seedSummary: SeedSummary = { mode: seedMode, status: 'skipped' };
  // Registrar antes de descubrir: un fallo posterior no debe ocultar altas ya guardadas.
  const run = await client.from('catalog_refresh_runs').insert({ started_at: startedAt }).select('id').single();
  if (run.error || !run.data) throw new Error('REFRESH_RUN_CREATE_FAILED');
  const counts = emptyCounts(), groups: Record<string, Counts> = {}, context = createKnownOfferContext(true);
  // Se serializa cada tienda incluso para adaptadores antiguos que aún no usan sourceFetch.
  const lanes = createStoreLanes({ concurrency, spacingMs: ADAPTIVE_STORE_SPACING_MS, isExempt: isSharedReadStore });
  const previousSourceConcurrency = setSourceFetchConcurrency(concurrency);
  // Una tienda pausada por 403/429/5xx no recibe más solicitudes en esta ejecución.
  // Sus ofertas quedan sin cerrar: liberar el lease no suma fallos ni backoff.
  const pausedStores = new Set<string>();
  const deferredStores: Record<string, number> = {};
  let deferred = 0;
  const isStorePaused = (storeId: string) => {
    if (!pausedStores.has(storeId) && sourceBlockedUntil(storeId) > Date.now()) pausedStores.add(storeId);
    return pausedStores.has(storeId);
  };
  let taskFailed = false;
  let failureCode: string | undefined;
  let claimDiagnostic: RefreshClaimDiagnostic | null = null;
  let seedAttempts: RefreshSeedAttempt[] = [];
  let seedPreparationFailed = false;
  const hasFailureDiagnostic = () => claimDiagnostic !== null || seedPreparationFailed;
  const closureFailureCodes: ClosureFailureCode[] = [];
  let claimBatchIndex = 0;
  let feedClaimed = 0, feedPhase = true;
  let feedDeadline = started + deadline;
  const phaseMs = { inventory: 0, preparation: 0, shared: 0, rotation: 0 };
  // Al menos la mitad del presupuesto queda para la rotación de otras tiendas.
  const feedLimit = Math.min(1200, Math.floor(maxOffers / 2));
  let status: 'completed' | 'deadline' | 'failed' = 'completed';
  async function reconciliationDue(now: number): Promise<{ due: boolean; reason: string }> {
    const recent = await client!.from('catalog_refresh_runs').select('started_at,seed:summary->seed')
      .gte('started_at', new Date(now - SEED_RECONCILIATION_HOURS * 3600_000).toISOString())
      .order('started_at', { ascending: false }).limit(200);
    if (recent.error || !Array.isArray(recent.data)) return { due: true, reason: 'history-unavailable' };
    const rows = recent.data as Array<{ started_at?: string; seed?: { status?: string } | null }>;
    if (rows.some(row => row.seed?.status === 'completed')) return { due: false, reason: 'reconciled' };
    const retryAfter = now - SEED_RETRY_HOURS * 3600_000;
    if (rows.some(row => row.seed?.status === 'failed' && Date.parse(row.started_at ?? '') >= retryAfter)) return { due: false, reason: 'recent-failure' };
    return { due: true, reason: 'reconciliation-due' };
  }
  async function finish(target: Target, outcome: Outcome, comparable = false) {
    let finished = await client!.rpc('finish_catalog_refresh', { p_offer_id: target.offer_id, p_token: token, p_result: outcome });
    // La RPC confirma el mismo token sin repetir el cambio si la respuesta se perdió.
    for (let retry=0; finished.error && retry<2; retry++) {
      await new Promise(resolve=>setTimeout(resolve,300 * (retry+1)));
      finished=await client!.rpc('finish_catalog_refresh', { p_offer_id: target.offer_id, p_token: token, p_result: outcome });
    }
    if (finished.error) throw new Error('REFRESH_FINISH_FAILED');
    if (finished.data !== true) throw new Error('REFRESH_LEASE_LOST');
    const group = groups[`${target.store_id}:${target.reason}`] ??= emptyCounts();
    for (const scope of [counts, group]) {
      scope.attempted++;
      if (outcome === 'observed') scope.observed++;
      else scope.failures[outcome] = (scope.failures[outcome] ?? 0) + 1;
      if (comparable) scope.comparable++;
    }
  }
  try {
    const inventoryStarted = Date.now();
    inventory = process.env.CATALOG_INVENTORY_DISCOVERY === '1' ? await runInventoryDiscovery() : [];
    inventoryDetails = process.env.CATALOG_INVENTORY_DISCOVERY === '1' && Date.now() - inventoryStarted < ADAPTIVE_INVENTORY_PHASE_MS
      ? await runInventoryDetailDiscovery({ maxRunMs: ADAPTIVE_INVENTORY_DETAIL_MS }) : undefined;
    phaseMs.inventory = Date.now() - inventoryStarted;
    const preparationStarted = Date.now();
    const seedDecision = seedMode === 'auto' ? await reconciliationDue(started) : { due: seedMode === 'always', reason: seedMode === 'always' ? 'forced' : 'disabled' };
    seedSummary = { mode: seedMode, status: 'skipped', reason: seedDecision.reason };
    if (seedDecision.due) try {
      for (let batch = 0; ; batch++) {
        if (seedMode === 'auto' && (batch >= 200 || Date.now() - preparationStarted >= SEED_AUTO_MAX_MS)) { seedSummary.status = 'partial'; break; }
        if (batch >= 200 || Date.now() - started >= deadline) throw new Error('REFRESH_SEED_DEADLINE');
        // Retener sólo el último lote; las respuestas externas no entran al resumen.
        seedAttempts = [];
        const seed = async (attemptIndex: number) => {
          const attemptStarted = Date.now();
          try {
            const result = await client.rpc('seed_catalog_refresh_queue');
            seedAttempts.push(createRefreshSeedAttempt(result.error, batch + 1, attemptIndex, Date.now() - attemptStarted));
            return result;
          } catch (error) {
            seedAttempts.push(createRefreshSeedAttempt(error, batch + 1, attemptIndex, Date.now() - attemptStarted));
            // Mantener el rechazo original: no añadir reintentos para excepciones.
            throw error;
          }
        };
        let result = await seed(1);
        // La preparación es idempotente: una respuesta perdida no duplica ofertas.
        for (let retry=0; result.error && retry<2 && Date.now()-started<deadline; retry++) {
          await new Promise(resolve=>setTimeout(resolve,500 * (retry+1)));
          result=await seed(retry + 2);
        }
        if (result.error) throw new Error(result.error.code==='57014' ? 'REFRESH_SEED_TIMEOUT' : 'REFRESH_SEED_FAILED');
        if (!Number.isSafeInteger(result.data) || result.data < 0 || result.data > 500) throw new Error('REFRESH_INVALID_SEED_RESULT');
        seeded += result.data;
        if (result.data === 0) { seedSummary.status = 'completed'; break; }
      }
    } catch (error) {
      const code = error instanceof Error && /^REFRESH_[A-Z_]+$/.test(error.message) ? error.message : 'REFRESH_UNEXPECTED_ERROR';
      seedSummary = { ...seedSummary, status: 'failed', code };
      // La conciliación automática no detiene la cola: los triggers ya registran altas y categorías.
      if (seedMode === 'always') { seedPreparationFailed = true; throw error; }
    } finally {
      phaseMs.preparation = Date.now() - preparationStarted;
    }
    // La cuota de filas sola no protege el tiempo de las fuentes no compartidas.
    feedDeadline = Date.now() + Math.max(0, started + deadline - Date.now()) / 2;
    while (counts.attempted + deferred < maxOffers && Date.now() - started < deadline) {
      if (feedClaimed >= feedLimit || Date.now() >= feedDeadline) feedPhase = false;
      const batchStarted = Date.now(), sharedBatch = feedPhase;
      const claimContext = {
        rpc: feedPhase ? 'claim_catalog_feed_refresh' as const : 'claim_catalog_refresh' as const,
        phase: feedPhase ? 'shared' as const : 'rotation' as const,
        batchIndex: ++claimBatchIndex,
        limit: Math.min(ADAPTIVE_CLAIM_BATCH, maxOffers - counts.attempted - deferred, feedPhase ? feedLimit - feedClaimed : ADAPTIVE_CLAIM_BATCH),
      };
      const claimStarted = Date.now();
      let claimed;
      try {
        claimed = await client.rpc(claimContext.rpc, { p_token: token, p_limit: claimContext.limit });
      } catch (error) {
        throw createRefreshClaimError(error, claimContext, Date.now() - claimStarted);
      }
      if (claimed.error) throw createRefreshClaimError(claimed.error, claimContext, Date.now() - claimStarted);
      const targets = claimed.data as Target[];
      if (!targets?.length) { if (feedPhase) { feedPhase=false; continue; } break; }
      if (feedPhase) feedClaimed += targets.length;
      const ids = [...new Set(targets.map(target => target.product_id))];
      const read = await client.from('products').select(PRODUCT_SELECT_FIELDS).in('id', ids).limit(ids.length);
      if (read.error) throw new Error('REFRESH_READ_FAILED');
      const products = new Map((read.data as unknown as DbProductRow[]).map(row => { const product = mapDbProduct(row); return [product.id, product]; }));
      await prepareKnownOfferBatch(products,targets.map(target=>({productId:target.product_id,storeId:target.store_id,url:target.url})),context);
      const observations = await Promise.all(targets.map(async target => {
        let paused = false;
        const result = await lanes.run(target.store_id, async () => {
          try {
            const product = products.get(target.product_id);
            const observation = product ? await fetchKnownOffer(product, { productId: target.product_id, storeId: target.store_id, url: target.url }, started, context).catch(() => null) : null;
            if (!observation) {
              const reason = context.failures.get(target.url);
              if (reason === 'rate-limited' || reason === 'blocked') pausedStores.add(target.store_id);
              await finish(target, reason === 'no-observation' ? 'no-observation' : 'source-failed');
              return null;
            }
            return { target, ...observation };
          } catch {
            taskFailed = true; return null;
          }
        }, () => taskFailed || Date.now() - started >= deadline || (paused = isStorePaused(target.store_id)));
        if (result === STORE_LANE_SKIPPED && paused) {
          deferred++;
          deferredStores[target.store_id] = (deferredStores[target.store_id] ?? 0) + 1;
        }
        return result;
      }));
      if (taskFailed) throw new Error('REFRESH_BATCH_FAILED');
      const observed = observations.filter(item => item !== null && item !== STORE_LANE_SKIPPED);
      // Lotes pequeños respetan el máximo de revisión de identidad existente.
      for (let offset = 0; offset < observed.length; offset += 8) {
        const batch = observed.slice(offset, offset + 8);
        const reviewed = await reviewProductOffers(batch.map(item => item.product), { authorizedRefresh: true,
          sourceTitles: Object.fromEntries(batch.map(item => [item.price.url, item.sourceTitle])) });
        for (let index = 0; index < batch.length; index++) {
          const item = batch[index], price = reviewed[index].prices[0];
          const state = { price: price.price, original_price: price.originalPrice ?? null, stock: price.stock,
            installment_count: price.installment?.count ?? null, installment_amount: price.installment?.amount ?? null };
          const persist = () => client.rpc('persist_adaptive_offer', {
            p_offer_id: item.target.offer_id, p_token: token,
            p_price: state.price, p_original_price: state.original_price, p_stock: state.stock,
            p_installment_count: state.installment_count, p_installment_amount: state.installment_amount,
            p_run_started_at: startedAt, p_observed_at: new Date(price.lastUpdated).toISOString(),
            p_review: price.identityReview ?? null, p_signature: buildPriceStateSignature(state),
            p_source_identity: price.sourceIdentity ?? null, p_price_condition: price.priceCondition ?? (price.storeId === 'compragamer' ? 'special' : 'unspecified'),
          });
          let persisted=await persist();
          // Repetir la misma observación no inserta otro historial; su fecha se conserva.
          for (let retry=0; persisted.error && retry<2; retry++) {
            await new Promise(resolve=>setTimeout(resolve,300 * (retry+1)));
            persisted=await persist();
          }
          const saved = !persisted.error && persisted.data === true;
          await finish(item.target, saved ? 'observed' : 'persist-failed', saved && isCatalogOfferFresh(price.lastUpdated) && isComparableStoreOffer(price, item.product));
        }
      }
      phaseMs[sharedBatch ? 'shared' : 'rotation'] += Date.now() - batchStarted;
      // El avance persiste por lote aunque el runner se interrumpa luego.
      const progress = await client.from('catalog_refresh_runs').update({ summary: { ...counts, groups, deferred, deferredStores, seed: seedSummary, phaseMs, sourceHttp: sourceHttpMetrics(), sharedReads: context.sharedReads } }).eq('id', run.data.id);
      if (progress.error) throw new Error('REFRESH_PROGRESS_FAILED');
    }
    if (Date.now() - started >= deadline) status = 'deadline';
    if (counts.attempted > 0 && counts.observed === 0) status = 'failed';
  } catch (error) {
    claimDiagnostic = extractRefreshClaimDiagnostic(error);
    failureCode = error instanceof Error && /^REFRESH_[A-Z_]+$/.test(error.message) ? error.message : 'REFRESH_UNEXPECTED_ERROR';
    status = 'failed';
  } finally {
    setSourceFetchConcurrency(previousSourceConcurrency);
    try {
      const released = await client.from('catalog_offer_refresh_state').update({ lease_token: null, leased_until: null }).eq('lease_token', token);
      if (released.error) {
        status = 'failed';
        if (hasFailureDiagnostic()) closureFailureCodes.push('REFRESH_RELEASE_FAILED');
      }
    } catch (error) {
      if (!hasFailureDiagnostic()) throw error;
      closureFailureCodes.push('REFRESH_RELEASE_FAILED');
      status = 'failed';
    }
  }
  let coverageData: unknown = null;
  try {
    const coverage = await client.rpc('catalog_refresh_coverage');
    if (coverage.error) {
      status = 'failed';
      if (hasFailureDiagnostic()) closureFailureCodes.push('REFRESH_COVERAGE_FAILED');
    } else {
      coverageData = coverage.data ?? [];
    }
  } catch (error) {
    if (!hasFailureDiagnostic()) throw error;
    closureFailureCodes.push('REFRESH_COVERAGE_FAILED');
    status = 'failed';
  }
  if (inventory.some(item => item.status === 'failed')) status = 'failed';
  if (inventoryDetails?.status === 'failed') status = 'failed';
  const sourceFailureReasons: Record<string,number> = {};
  for (const reason of context.failures.values()) sourceFailureReasons[reason]=(sourceFailureReasons[reason] ?? 0)+1;
  const seedDiagnostic = sanitizeRefreshSeedDiagnostic({ attempts: seedAttempts });
  const summary = { source: 'adaptive-catalog', trigger: ['github-schedule','cloudflare-fallback'].includes(process.env.CATALOG_RUN_TRIGGER ?? '') ? process.env.CATALOG_RUN_TRIGGER : 'manual', runId: run.data.id, startedAt, finishedAt: new Date().toISOString(),
    status, failureCode, ...(claimDiagnostic ? { claimDiagnostic } : {}), ...(seedDiagnostic ? { seedDiagnostic } : {}),
    ...(hasFailureDiagnostic() ? { closure: { failureCodes: closureFailureCodes } } : {}), inventory, inventoryDetails, feedClaimed, sourceFailureReasons, limitReached: counts.attempted + deferred >= maxOffers, ...counts, groups, deferred, deferredStores, seeded, seed: seedSummary, phaseMs, sourceHttp: sourceHttpMetrics(), sharedReads: context.sharedReads, coverage: coverageData };
  let summaryPersistence: 'confirmed' | 'unconfirmed' = 'unconfirmed';
  try {
    const completed = await client.from('catalog_refresh_runs').update({ status, finished_at: summary.finishedAt, summary }).eq('id', run.data.id);
    if (completed.error) throw new Error('REFRESH_PROGRESS_FAILED');
    summaryPersistence = 'confirmed';
  } catch (error) {
    if (!hasFailureDiagnostic()) throw error;
    closureFailureCodes.push('REFRESH_PROGRESS_FAILED');
  }
  // Confirma sólo el ACK del update, no verifica commit posterior ni rollback.
  // El payload enviado todavía no podía conocer esa confirmación.
  return hasFailureDiagnostic() ? { ...summary, closure: { failureCodes: closureFailureCodes, summaryPersistence } } : summary;
}
