import { normalizeIdentityText, parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';
import type { HardwareCategory } from '@/lib/types';

export const IDENTITY_REVIEW_MIN_CONFIDENCE = 0.8;

export type IdentityReviewReason = 'consistent-text' | 'explicit-conflict' | 'model-conflict'
  | 'insufficient-evidence' | 'low-confidence' | 'provider-unavailable' | 'invalid-response';

export type OfferIdentityReview = {
  version: 1;
  status: 'consistent' | 'needs-review';
  reason: IdentityReviewReason;
  reviewedAt: string | null;
  model: string | null;
  confidence: number | null;
  subject: { name: string; category: string; url: string };
};

export type IdentityEvidence = {
  name: string;
  category: HardwareCategory;
  offerText: string;
  sourceTitle?: string;
};

const REASONS = new Set<IdentityReviewReason>([
  'consistent-text', 'explicit-conflict', 'model-conflict', 'insufficient-evidence',
  'low-confidence', 'provider-unavailable', 'invalid-response',
]);

export function readIdentityReview(value: unknown): OfferIdentityReview | undefined {
  if (value == null) return undefined;
  const review = value as Partial<OfferIdentityReview>;
  if (review.version === 1 && ['consistent', 'needs-review'].includes(review.status ?? '')
    && REASONS.has(review.reason as IdentityReviewReason)
    && (review.reviewedAt === null || (typeof review.reviewedAt === 'string' && Number.isFinite(Date.parse(review.reviewedAt))))
    && (review.model === null || (typeof review.model === 'string' && /^jev-[\w.-]{1,40}$/.test(review.model)))
    && (review.confidence === null || (typeof review.confidence === 'number' && Number.isFinite(review.confidence) && review.confidence >= 0 && review.confidence <= 1))
    && typeof review.subject?.name === 'string' && typeof review.subject?.category === 'string'
    && typeof review.subject?.url === 'string'
    && (review.status !== 'consistent' || (review.reason === 'consistent-text' && review.model && review.reviewedAt
      && typeof review.confidence === 'number' && review.confidence >= IDENTITY_REVIEW_MIN_CONFIDENCE))) {
    return review as OfferIdentityReview;
  }
  // Un registro dañado no debe convertirse silenciosamente en una aprobación.
  return {
    version: 1, status: 'needs-review', reason: 'invalid-response', reviewedAt: null,
    model: null, confidence: null, subject: { name: '', category: '', url: '' },
  };
}

export function needsIdentityReview(
  offer: { url?: string; identityReview?: OfferIdentityReview },
  product?: { name: string; category?: string },
): boolean {
  const review = readIdentityReview(offer.identityReview);
  if (!review) return false; // Ausencia conserva el contrato de ofertas todavía no evaluadas.
  if (review.status === 'needs-review' || review.subject.url !== offer.url) return true;
  return Boolean(product && (review.subject.name !== normalizeIdentityText(product.name)
    || (product.category && review.subject.category !== product.category)));
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
  if (evidence.category === 'tarjetas-graficas') {
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
  // Sólo atributos explícitos en ambos textos. Una omisión no prueba contradicción.
  return [/\bcl\s*(\d{2,3})\b/i, /\b(\d{4,5})\s*(?:mhz|mt\s*\/\s*s)\b/i, /\bddr\s*([345])\b/i]
    .some((pattern) => {
      const left = evidence.name.match(pattern)?.[1];
      const right = evidence.offerText.match(pattern)?.[1];
      return Boolean(left && right && left !== right);
    });
}
