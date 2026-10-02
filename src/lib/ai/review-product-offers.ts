import 'server-only';
import { createHash } from 'node:crypto';
import { normalizeIdentityText } from '@/lib/product-identity';
import { buildIdentityEvidence, hasExplicitIdentityConflict, IDENTITY_REVIEW_MIN_CONFIDENCE, type IdentityEvidence, type OfferIdentityReview } from '@/lib/quality/offer-identity';
import { evaluateOfferIdentity, JEV_BATCH_SIZE, JEV_MODEL, JEV_PROMPT_VERSION, parseJevEvaluation, type JevEvaluation } from '@/lib/ai/jev-client';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import { logger } from '@/lib/logger';
import { proveOfferAttributes } from '@/lib/quality/offer-attribute-proof';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import type { Product, ProductPrice } from '@/lib/types';
import { withConcurrencyLimit } from '@/lib/async/concurrency';
import { withPromiseTimeout } from '@/lib/async/with-abort-timeout';

const MAX_OFFERS_PER_REFRESH = 16;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Umbral conservador y exploratorio; no equivale a probabilidad de acierto.
const MIN_CONFIDENCE = IDENTITY_REVIEW_MIN_CONFIDENCE;
const CATEGORIES = new Set(['procesadores', 'tarjetas-graficas', 'memoria-ram']);

type Candidate = { product: Product; price: ProductPrice; evidence: IdentityEvidence };

function safeProviderErrorCode(error: unknown): string {
  // Solo códigos propios exactos: nunca mensajes, cuerpos o credenciales del proveedor.
  return error instanceof Error
    && /^JEV_(?:HTTP_[1-5]\d{2}|INVALID_REQUEST|INVALID_RESPONSE|RESPONSE_TOO_LARGE|TIMEOUT|UNAVAILABLE)$/.test(error.message)
    ? error.message
    : 'JEV_UNAVAILABLE';
}

export function collectOfferSourceTitles(products: Product[]): Record<string, string> {
  const titles: Record<string, string> = Object.create(null);
  for (const product of products) {
    const title = product.name.trim();
    if (!title || title.length > 400) continue;
    for (const price of product.prices) {
      if (price.url && !titles[price.url]) titles[price.url] = title;
    }
  }
  return titles;
}

function reviewFor(candidate: Pick<Candidate, 'product' | 'price'>, reason: OfferIdentityReview['reason'], now: string): OfferIdentityReview {
  return {
    ...(candidate.price.sourceIdentity ? { sourceIdentity: candidate.price.sourceIdentity } : {}),
    version: 1, status: ['consistent-text', 'exact-attributes'].includes(reason) ? 'consistent' : 'needs-review', reason,
    reviewedAt: now, model: null, confidence: null,
    subject: { name: normalizeIdentityText(candidate.product.name), category: candidate.product.category, url: candidate.price.url },
  };
}

type ReviewedEvidence = { evaluation: JevEvaluation; reviewedAt: string };
function cacheKey(evidence: IdentityEvidence): string {
  return createHash('sha256').update(JSON.stringify([JEV_PROMPT_VERSION, JEV_MODEL, evidence])).digest('hex');
}

async function readEvidenceCache(evidence: IdentityEvidence): Promise<ReviewedEvidence | undefined> {
  const cached = await withPromiseTimeout(
    getSharedCache<{ savedAt: number; response: unknown }>('jev-identity-offer', cacheKey(evidence)), 500, 'jev-cache-read',
  ).catch(() => undefined);
  if (cached && Number.isFinite(cached.savedAt) && Date.now() >= cached.savedAt && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    try { return { evaluation: parseJevEvaluation(cached.response, 1), reviewedAt: new Date(cached.savedAt).toISOString() }; } catch { /* Recalcular evidencia inválida. */ }
  }
}

async function writeEvidenceCache(evidence: IdentityEvidence, evaluation: JevEvaluation, savedAt: number): Promise<void> {
  const response = { ...evaluation, answers: { offer_0: { type: 'choice', ...evaluation.answers[0] } } };
  await withPromiseTimeout(setSharedCache('jev-identity-offer', cacheKey(evidence), { savedAt, response }, CACHE_TTL_MS), 500, 'jev-cache-write').catch(() => undefined);
}

export async function reviewProductOffers(products: Product[], options: { authorizedRefresh: boolean; sourceTitles?: Record<string, string> }): Promise<Product[]> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!options.authorizedRefresh || products.length === 0) return products;
  const providerEnabled = process.env.ENABLE_JEV_OFFER_REVIEW === '1' && Boolean(apiKey);
  const now = new Date().toISOString();
  const candidates: Candidate[] = [];
  let explicitConflicts = 0;
  let attributeMatches = 0;
  let reusedReviews = 0;
  const result = products.map((product) => {
    if (!CATEGORIES.has(product.category)) return product;
    const copy = { ...product, prices: product.prices.map((price) => ({ ...price })) };
    for (const price of copy.prices) {
      const evidence = buildIdentityEvidence(copy.name, copy.category, price.url, price.sourceIdentity?.title ?? options.sourceTitles?.[price.url]);
      if (evidence && price.sourceIdentity) evidence.sourceIdentity = price.sourceIdentity;
      if (!evidence || hasExplicitIdentityConflict(evidence)) {
        const reason = evidence ? 'explicit-conflict' : 'insufficient-evidence';
        price.identityReview = reviewFor({ product: copy, price }, reason, now);
        if (evidence) explicitConflicts++;
      } else {
        const proof = price.sourceIdentity && proveOfferAttributes(copy.name, copy.category, price.sourceIdentity.title);
        if (proof) {
          price.identityReview = { ...reviewFor({ product: copy, price }, 'exact-attributes', now), proof };
          attributeMatches++;
        } else if (price.identityReview?.reviewedAt && !needsIdentityReview(price, copy)
          && Date.now() >= Date.parse(price.identityReview.reviewedAt)
          && Date.now() - Date.parse(price.identityReview.reviewedAt) < CACHE_TTL_MS) {
          reusedReviews++;
        } else {
          // Un límite de lote o falta de proveedor no debe dejar una aprobación implícita.
          price.identityReview = reviewFor({ product: copy, price }, providerEnabled ? 'insufficient-evidence' : 'provider-unavailable', now);
          if (providerEnabled && candidates.length < MAX_OFFERS_PER_REFRESH) candidates.push({ product: copy, price, evidence });
        }
      }
    }
    return copy;
  });
  let evaluated = 0;
  let cacheHits = 0;
  let providerCalls = 0;
  // Una evidencia puede repetirse entre productos o guías. El precio y el stock
  // no forman parte de la identidad ni se renuevan al reutilizar este dictamen.
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = cacheKey(candidate.evidence);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const unique = [...groups.values()];
  const cached = await withConcurrencyLimit(unique.map(group => () => readEvidenceCache(group[0].evidence)), 4);
  const apply = (group: Candidate[], reviewed: ReviewedEvidence) => {
    const answer = reviewed.evaluation.answers[0];
    const reason = answer.confidence < MIN_CONFIDENCE ? 'low-confidence'
      : answer.choice === 'identity_consistent' ? 'consistent-text'
        : answer.choice === 'identity_conflict' ? 'model-conflict' : 'insufficient-evidence';
    for (const candidate of group) {
      candidate.price.identityReview = { ...reviewFor(candidate, reason, reviewed.reviewedAt), model: reviewed.evaluation.model, confidence: answer.confidence };
      evaluated++;
    }
  };
  const missing: Candidate[][] = [];
  unique.forEach((group, index) => {
    const entry = cached[index];
    if (entry) { apply(group, entry); cacheHits += group.length; }
    else missing.push(group);
  });
  let unavailable = false;
  for (let offset = 0; offset < missing.length; offset += JEV_BATCH_SIZE) {
    const batch = missing.slice(offset, offset + JEV_BATCH_SIZE);
    try {
      if (unavailable) throw new Error('JEV_UNAVAILABLE');
      providerCalls++;
      const evaluation = await evaluateOfferIdentity(batch.map(group => group[0].evidence), apiKey!);
      const savedAt = Date.now();
      await withConcurrencyLimit(batch.map((group, index) => async () => {
        const single = { ...evaluation, answers: [evaluation.answers[index]] };
        apply(group, { evaluation: single, reviewedAt: new Date(savedAt).toISOString() });
        await writeEvidenceCache(group[0].evidence, single, savedAt);
      }), 4);
    } catch (error) {
      unavailable = true;
      const invalid = error instanceof Error && error.message === 'JEV_INVALID_RESPONSE';
      for (const candidate of batch.flat()) {
        candidate.price.identityReview = reviewFor(candidate, invalid ? 'invalid-response' : 'provider-unavailable', now);
      }
      logger.warn('Offer identity review unavailable', {
        reason: invalid ? 'invalid-response' : 'provider-unavailable',
        providerErrorCode: safeProviderErrorCode(error),
        offerCount: batch.flat().length,
      });
    }
  }
  const pending = result.filter(product => CATEGORIES.has(product.category)).reduce((total, product) =>
    total + product.prices.filter(price => needsIdentityReview(price, product)).length, 0);
  logger.info('Offer identity review completed', { evaluated, pending, explicitConflicts, attributeMatches, reusedReviews, cacheHits, providerCalls, model: JEV_MODEL, maxOffers: MAX_OFFERS_PER_REFRESH });
  return result;
}
