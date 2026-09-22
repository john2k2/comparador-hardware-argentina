import 'server-only';
import { createHash } from 'node:crypto';
import { normalizeIdentityText } from '@/lib/product-identity';
import { buildIdentityEvidence, hasExplicitIdentityConflict, IDENTITY_REVIEW_MIN_CONFIDENCE, type IdentityEvidence, type OfferIdentityReview } from '@/lib/quality/offer-identity';
import { evaluateOfferIdentity, JEV_BATCH_SIZE, JEV_MODEL, JEV_PROMPT_VERSION, parseJevEvaluation, type JevEvaluation } from '@/lib/ai/jev-client';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import { logger } from '@/lib/logger';
import type { Product, ProductPrice } from '@/lib/types';
import { withPromiseTimeout } from '@/lib/async/with-abort-timeout';

const MAX_OFFERS_PER_REFRESH = 16;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Umbral conservador y exploratorio; no equivale a probabilidad de acierto.
const MIN_CONFIDENCE = IDENTITY_REVIEW_MIN_CONFIDENCE;
const CATEGORIES = new Set(['procesadores', 'tarjetas-graficas', 'memoria-ram']);

type Candidate = { product: Product; price: ProductPrice; evidence: IdentityEvidence };

function reviewFor(candidate: Pick<Candidate, 'product' | 'price'>, reason: OfferIdentityReview['reason'], now: string): OfferIdentityReview {
  return {
    version: 1, status: reason === 'consistent-text' ? 'consistent' : 'needs-review', reason,
    reviewedAt: now, model: null, confidence: null,
    subject: { name: normalizeIdentityText(candidate.product.name), category: candidate.product.category, url: candidate.price.url },
  };
}

function cacheKey(evidence: IdentityEvidence[]): string {
  return createHash('sha256').update(JSON.stringify([JEV_PROMPT_VERSION, JEV_MODEL, evidence])).digest('hex');
}

async function evaluateBatch(evidence: IdentityEvidence[], apiKey: string): Promise<{ evaluation: JevEvaluation; reviewedAt: string }> {
  const key = cacheKey(evidence);
  const cached = await withPromiseTimeout(
    getSharedCache<{ savedAt: number; response: unknown }>('jev-identity', key), 500, 'jev-cache-read',
  ).catch(() => undefined);
  if (cached && Number.isFinite(cached.savedAt) && Date.now() >= cached.savedAt && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    try { return { evaluation: parseJevEvaluation(cached.response, evidence.length), reviewedAt: new Date(cached.savedAt).toISOString() }; } catch { /* Recalcular caché inválida. */ }
  }
  const result = await evaluateOfferIdentity(evidence, apiKey);
  const savedAt = Date.now();
  // Se conserva el contrato HTTP para validar también las respuestas cacheadas.
  const response = { ...result, answers: Object.fromEntries(result.answers.map((answer, index) => [`offer_${index}`, { type: 'choice', ...answer }])) };
  await withPromiseTimeout(setSharedCache('jev-identity', key, { savedAt, response }, CACHE_TTL_MS), 500, 'jev-cache-write').catch(() => undefined);
  return { evaluation: result, reviewedAt: new Date(savedAt).toISOString() };
}

export async function reviewProductOffers(products: Product[], options: { authorizedRefresh: boolean; sourceTitles?: Record<string, string> }): Promise<Product[]> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!options.authorizedRefresh || process.env.ENABLE_JEV_OFFER_REVIEW !== '1' || !apiKey || products.length === 0) return products;
  const now = new Date().toISOString();
  const candidates: Candidate[] = [];
  let explicitConflicts = 0;
  const result = products.map((product) => {
    if (!CATEGORIES.has(product.category)) return product;
    const copy = { ...product, prices: product.prices.map((price) => ({ ...price })) };
    for (const price of copy.prices) {
      const evidence = buildIdentityEvidence(copy.name, copy.category, price.url, options.sourceTitles?.[price.url]);
      if (!evidence || hasExplicitIdentityConflict(evidence)) {
        const reason = evidence ? 'explicit-conflict' : 'insufficient-evidence';
        price.identityReview = reviewFor({ product: copy, price }, reason, now);
        if (evidence) explicitConflicts++;
      } else if (candidates.length < MAX_OFFERS_PER_REFRESH) {
        candidates.push({ product: copy, price, evidence });
      }
    }
    return copy;
  });
  let evaluated = 0;
  let pending = 0;
  let unavailable = false;
  for (let offset = 0; offset < candidates.length; offset += JEV_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + JEV_BATCH_SIZE);
    try {
      if (unavailable) throw new Error('JEV_UNAVAILABLE');
      const { evaluation, reviewedAt } = await evaluateBatch(batch.map((candidate) => candidate.evidence), apiKey);
      batch.forEach((candidate, index) => {
        const answer = evaluation.answers[index];
        const reason = answer.confidence < MIN_CONFIDENCE ? 'low-confidence'
          : answer.choice === 'identity_consistent' ? 'consistent-text'
            : answer.choice === 'identity_conflict' ? 'model-conflict' : 'insufficient-evidence';
        candidate.price.identityReview = { ...reviewFor(candidate, reason, reviewedAt), model: evaluation.model, confidence: answer.confidence };
        evaluated++;
        if (reason !== 'consistent-text') pending++;
      });
    } catch (error) {
      unavailable = true; // Sin reintentos en esta actualización; respeta 429/529 y evita multiplicar consumo.
      const invalid = error instanceof Error && error.message === 'JEV_INVALID_RESPONSE';
      for (const candidate of batch) {
        candidate.price.identityReview = reviewFor(candidate, invalid ? 'invalid-response' : 'provider-unavailable', now);
        pending++;
      }
      logger.warn('Offer identity review unavailable', { reason: invalid ? 'invalid-response' : 'provider-unavailable', offerCount: batch.length });
    }
  }
  logger.info('Offer identity review completed', { evaluated, pending, explicitConflicts, model: JEV_MODEL, maxOffers: MAX_OFFERS_PER_REFRESH });
  return result;
}
