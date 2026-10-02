import { extractGpuBoardAttributes, normalizeIdentityText, parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';
import type { HardwareCategory, OfferSourceIdentity } from '@/lib/types';
import { attributeProofMatches, cpuVariantAttributes, type OfferAttributeProof } from './offer-attribute-proof';

export const IDENTITY_REVIEW_MIN_CONFIDENCE = 0.8;

export type IdentityReviewReason = 'consistent-text' | 'exact-attributes' | 'explicit-conflict' | 'model-conflict'
  | 'insufficient-evidence' | 'low-confidence' | 'provider-unavailable' | 'invalid-response';

export type OfferIdentityReview = {
  version: 1;
  status: 'consistent' | 'needs-review';
  reason: IdentityReviewReason;
  reviewedAt: string | null;
  model: string | null;
  confidence: number | null;
  subject: { name: string; category: string; url: string };
  sourceIdentity?: import('@/lib/types').OfferSourceIdentity;
  proof?: OfferAttributeProof;
};

export type IdentityEvidence = {
  name: string;
  category: HardwareCategory;
  offerText: string;
  sourceTitle?: string;
  sourceIdentity?: import('@/lib/types').OfferSourceIdentity;
};

const REASONS = new Set<IdentityReviewReason>([
  'consistent-text', 'exact-attributes', 'explicit-conflict', 'model-conflict', 'insufficient-evidence',
  'low-confidence', 'provider-unavailable', 'invalid-response',
]);

export function readSourceIdentity(value: unknown): OfferSourceIdentity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Partial<OfferSourceIdentity>;
  return typeof source.title === 'string' && source.title.trim().length > 0 && source.title.length <= 400
    && typeof source.listingRef === 'string' && source.listingRef.length > 0 && source.listingRef.length <= 2048
    && (source.storeSku === undefined || typeof source.storeSku === 'string' && source.storeSku.length <= 160)
    && (source.sourceId === undefined || typeof source.sourceId === 'string' && /^[1-9]\d{0,14}$/.test(source.sourceId))
    ? source as OfferSourceIdentity : undefined;
}

export function readIdentityReview(value: unknown): OfferIdentityReview | undefined {
  if (value == null) return undefined;
  const review = value as Partial<OfferIdentityReview>;
  if (review.version === 1 && ['consistent', 'needs-review'].includes(review.status ?? '')
    && (review.sourceIdentity === undefined || readSourceIdentity(review.sourceIdentity) !== undefined)
    && REASONS.has(review.reason as IdentityReviewReason)
    && (review.reviewedAt === null || (typeof review.reviewedAt === 'string' && Number.isFinite(Date.parse(review.reviewedAt))))
    && (review.model === null || (typeof review.model === 'string' && /^jev-[\w.-]{1,40}$/.test(review.model)))
    && (review.confidence === null || (typeof review.confidence === 'number' && Number.isFinite(review.confidence) && review.confidence >= 0 && review.confidence <= 1))
    && typeof review.subject?.name === 'string' && typeof review.subject?.category === 'string'
    && typeof review.subject?.url === 'string'
    && (review.status !== 'consistent' || (review.reason === 'consistent-text' && review.model && review.reviewedAt
      && typeof review.confidence === 'number' && review.confidence >= IDENTITY_REVIEW_MIN_CONFIDENCE)
      || (review.reason === 'exact-attributes' && review.model === null && review.confidence === null && review.reviewedAt
        && review.sourceIdentity && review.proof?.version === 1 && review.proof.method === 'exact-attributes'
        && attributeProofMatches(review.proof, review.subject.name, review.subject.category, review.sourceIdentity.title)))) {
    return review as OfferIdentityReview;
  }
  // Un registro dañado no debe convertirse silenciosamente en una aprobación.
  return {
    version: 1, status: 'needs-review', reason: 'invalid-response', reviewedAt: null,
    model: null, confidence: null, subject: { name: '', category: '', url: '' },
  };
}

export function needsIdentityReview(
  offer: { url?: string; identityReview?: OfferIdentityReview; sourceIdentity?: OfferSourceIdentity },
  product?: { name: string; category?: string },
): boolean {
  const review = readIdentityReview(offer.identityReview);
  if (!review) return false; // Ausencia conserva el contrato de ofertas todavía no evaluadas.
  if (review.status === 'needs-review' || review.subject.url !== offer.url) return true;
  if (offer.sourceIdentity && !sameSourceIdentity(review.sourceIdentity, offer.sourceIdentity)) return true;
  return Boolean(product && (review.subject.name !== normalizeIdentityText(product.name)
    || (product.category && review.subject.category !== product.category)));
}

/** Un cambio de publicación, título o SKU invalida el dictamen anterior. */
export function sameSourceIdentity(first?: OfferSourceIdentity, second?: OfferSourceIdentity): boolean {
  return Boolean(readSourceIdentity(first) && readSourceIdentity(second) && first && second && first.listingRef === second.listingRef
    && normalizeIdentityText(first.title) === normalizeIdentityText(second.title)
    && (first.storeSku ?? '') === (second.storeSku ?? '')
    && (first.sourceId ?? '') === (second.sourceId ?? ''));
}

export function bindReviewToSource(review: OfferIdentityReview | undefined, sourceIdentity: OfferSourceIdentity | undefined, product: { name: string; category: string }, url: string): OfferIdentityReview | undefined {
  if (!review || !sourceIdentity || sameSourceIdentity(review.sourceIdentity, sourceIdentity)) return review;
  return { version: 1, status: 'needs-review', reason: 'insufficient-evidence', reviewedAt: null,
    model: null, confidence: null, sourceIdentity,
    subject: { name: normalizeIdentityText(product.name), category: product.category, url } };
}

export function buildIdentityEvidence(name: string, category: HardwareCategory, rawUrl: string, sourceTitle?: string): IdentityEvidence | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    // Sólo texto público del producto. No se envían parámetros, fragmentos ni URLs de sesión.
    const offerText = decodeURIComponent(url.pathname).replace(/[-_/]+/g, ' ').trim();
    if (!name.trim() || name.length > 400 || !offerText || offerText.length > 1000) return null;
    if (sourceTitle !== undefined && (!sourceTitle.trim() || sourceTitle.length > 400)) return null;
    if (/apikey_[a-z0-9_]{20,}|bearer\s+\S+/i.test(`${name} ${offerText} ${sourceTitle ?? ''}`)) return null;
    return { name, category, offerText, ...(sourceTitle ? { sourceTitle } : {}) };
  } catch {
    return null;
  }
}

export function hasExplicitIdentityConflict(evidence: IdentityEvidence): boolean {
  if (/\b(outlet|reacondicionado|usado|refurbished)\b/i.test(evidence.offerText) && !/\b(outlet|reacondicionado|usado|refurbished)\b/i.test(evidence.name)) return true;
  if (evidence.sourceTitle && hasExplicitIdentityConflict({ name: evidence.name, category: evidence.category, offerText: evidence.sourceTitle })) return true;
  if (evidence.category==='procesadores') {
    const left=cpuVariantAttributes(evidence.name),right=cpuVariantAttributes(evidence.offerText);
    if(left.cooler==='conflict'||right.cooler==='conflict'
      ||Object.keys(left).some(key=>left[key]&&right[key]&&left[key]!==right[key])) return true;
  }
  if (evidence.category === 'tarjetas-graficas') {
    const target = extractGpuBoardAttributes(evidence.name);
    const source = extractGpuBoardAttributes(evidence.offerText);
    // Sólo contradicciones explícitas. Omitir EVO/OC/color no prueba equivalencia.
    if ((Object.keys(target) as Array<keyof typeof target>).some(key => target[key] && source[key] && target[key] !== source[key])) return true;
    const capacity = (value: string) => {
      const match = value.match(/\b(\d{1,4})\s*(gb|mb)\b/i);
      return match ? Number(match[1]) * (match[2].toLowerCase() === 'gb' ? 1024 : 1) : null;
    };
    const left = capacity(evidence.name), right = capacity(evidence.offerText);
    if (left !== null && right !== null && left !== right) return true;
  }
  const parse = evidence.category === 'tarjetas-graficas' ? parseGpuChipSignature
    : evidence.category === 'procesadores' ? parseCpuModelSignature : null;
  if (parse) {
    const left = parse(evidence.name);
    const right = parse(evidence.offerText);
    // “Ryzen 5600” omite el segmento 5; no contradice “Ryzen 5 5600”.
    const omittedRyzenTier = left && right && (left.family === 'ryzen' || right.family === 'ryzen')
      && /^ryzen[3579]?$/.test(left.family) && /^ryzen[3579]?$/.test(right.family);
    return Boolean(left && right && (left.number !== right.number
      || left.suffixes.join(' ') !== right.suffixes.join(' ')
      || (left.family !== 'unknown' && right.family !== 'unknown' && left.family !== right.family && !omittedRyzenTier)));
  }
  if (evidence.category !== 'memoria-ram') return false;
  const ramBrand = (value: string) => value.match(/\b(corsair|kingston|adata|crucial|gskill|patriot|lexar|mushkin|teamgroup|team)\b/i)?.[1]?.toLowerCase();
  const ramSeries = (value: string) => value.match(/\b(lpx|rs|beast|impact|redline|lancer|viper|venom|vulcan)\b/i)?.[1]?.toLowerCase();
  const leftBrand = ramBrand(evidence.name), rightBrand = ramBrand(evidence.offerText);
  if (leftBrand && rightBrand && leftBrand !== rightBrand) return true;
  const leftSeries = ramSeries(evidence.name), rightSeries = ramSeries(evidence.offerText);
  if (leftSeries && rightSeries && leftSeries !== rightSeries) return true;
  const kit = (value: string) => value.match(/\b(\d)\s*x\s*(\d{1,3})\s*gb\b/i)?.slice(1).join('x');
  const leftKit = kit(evidence.name), rightKit = kit(evidence.offerText);
  if (leftKit && rightKit && leftKit !== rightKit) return true;
  const rgbConflict = (a: string, b: string) => /\brgb\b/i.test(a) && /\b(?:sin|no|non)[ -]?rgb\b/i.test(b) && !/\b(?:sin|no|non)[ -]?rgb\b/i.test(a);
  if (rgbConflict(evidence.name, evidence.offerText) || rgbConflict(evidence.offerText, evidence.name)) return true;
  // Sólo atributos explícitos en ambos textos. Una omisión no prueba contradicción.
  return [/\bcl\s*(\d{2,3})\b/i, /\b(\d{1,3})\s*gb\b/i, /\b(\d{4,5})\s*(?:mhz|mt\s*\/\s*s)\b/i, /\bddr\s*([345])\b/i]
    .some((pattern) => {
      const left = evidence.name.match(pattern)?.[1];
      const right = evidence.offerText.match(pattern)?.[1];
      return Boolean(left && right && left !== right);
    });
}
