import { buildIdentityEvidence, hasExplicitIdentityConflict, needsIdentityReview, readIdentityReview, readSourceIdentity } from '@/lib/quality/offer-identity';
import { listingReference } from '@/lib/scrapers/listing-reference';
import type { HardwareCategory } from '@/lib/types';

type SampleProduct = { id: string; category: HardwareCategory; name: string };
type SamplePrice = { product_id: string; store_id?: string; url: string; stock: string; price: unknown; last_updated: string | null; identity_review?: unknown; source_identity?: unknown };

// Evidencia adicional para G02, no una aprobación comercial o garantía de stock.
// Usa el mismo contrato de identidad que la aplicación; no basta status=consistent.
export function measureG02Sample(products: SampleProduct[], prices: SamplePrice[], measuredAt: string) {
  const now = Date.parse(measuredAt);
  if (!Number.isFinite(now)) throw new Error('G02_INVALID_MEASUREMENT_DATE');
  const byProduct = products.map(product => ({ productId: product.id, category: product.category,
    available: 0, fresh24h: 0, fresh3h: 0, identityPending3h: 0,
    identityAccepted3h: 0, identityUnverified3h: 0, explicitConflicts3h: 0 }));
  const rows = new Map(byProduct.map(row => [row.productId, row]));
  const catalog = new Map(products.map(product => [product.id, product]));
  for (const price of prices) {
    const row = rows.get(price.product_id), product = catalog.get(price.product_id);
    if (!row || !product || !['in-stock', 'low-stock'].includes(price.stock) || !Number.isFinite(Number(price.price)) || Number(price.price) <= 0) continue;
    row.available++;
    const observedAt = Date.parse(price.last_updated ?? '');
    if (!Number.isFinite(observedAt) || observedAt > now) continue;
    if (now - observedAt <= 24 * 60 * 60 * 1000) row.fresh24h++;
    if (now - observedAt > 3 * 60 * 60 * 1000) continue;
    row.fresh3h++;
    const review = readIdentityReview(price.identity_review);
    // Conservar el contador histórico de status persistido sin reescribir su significado.
    if ((price.identity_review as { status?: string } | null)?.status === 'needs-review') row.identityPending3h++;
    const invalidSource = price.source_identity != null && !readSourceIdentity(price.source_identity);
    const sourceIdentity = readSourceIdentity(price.source_identity) ?? (invalidSource ? undefined : review?.sourceIdentity);
    const evidence = buildIdentityEvidence(product.name, product.category, price.url, sourceIdentity?.title);
    const conflict = evidence ? hasExplicitIdentityConflict(evidence) : false;
    if (conflict) row.explicitConflicts3h++;
    const validUrl = !price.store_id || listingReference(price.store_id, price.url) !== null;
    const accepted = !invalidSource && validUrl && evidence && !conflict && review?.sourceIdentity && review.status === 'consistent'
      && !needsIdentityReview({ url: price.url, identityReview: review, sourceIdentity }, product);
    if (accepted) row.identityAccepted3h++;
    else row.identityUnverified3h++;
  }
  const sum = (key: keyof Omit<typeof byProduct[number], 'productId' | 'category'>) => byProduct.reduce((total, row) => total + row[key], 0);
  return { denominator: sum('available'), fresh24h: sum('fresh24h'), fresh3h: sum('fresh3h'),
    identityPending3h: sum('identityPending3h'), candidateComparable3h: sum('fresh3h') - sum('identityPending3h'),
    identityAccepted3h: sum('identityAccepted3h'), identityUnverified3h: sum('identityUnverified3h'),
    explicitConflicts3h: sum('explicitConflicts3h'),
    productsWithAcceptedOffer3h: byProduct.filter(row => row.identityAccepted3h > 0).length,
    productsWithoutAcceptedOffer3h: byProduct.filter(row => row.identityAccepted3h === 0).map(row => row.productId), byProduct };
}
