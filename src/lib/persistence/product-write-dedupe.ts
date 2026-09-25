import { createHash } from 'node:crypto';

const PRODUCT_TOUCH_INTERVAL_MS = 12 * 60 * 60 * 1000;
// La ficha acepta ofertas observadas en las últimas 3 horas. Si una tienda
// confirma el mismo precio, persistir esa nueva observación antes de vencer.
const PRICE_TOUCH_INTERVAL_MS = 2 * 60 * 60 * 1000;

type ProductSignatureInput = {
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string | null;
  image: string | null;
  normalized_title: string | null;
  canonical_product_key: string | null;
  family_key: string | null;
  variant_key: string | null;
  refresh_priority: string;
  specs: Record<string, string>;
  lowest_price: number;
  highest_price: number;
  average_price: number;
};

type ProductExistingState = {
  content_signature: string | null;
  last_seen_at: string | null;
  last_scraped_at: string | null;
};

type PriceSignatureInput = {
  price: number;
  original_price: number | null;
  stock: 'in-stock' | 'low-stock' | 'out-of-stock' | 'unknown';
  installment_count: number | null;
  installment_amount: number | null;
  identity_review?: unknown;
};

type PriceExistingState = {
  state_signature: string | null;
  last_updated: string | null;
  identity_review?: unknown;
};

function hashPayload(parts: unknown[]): string {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex');
}

function normalizeSpecs(specs: Record<string, string>): Array<[string, string]> {
  return Object.entries(specs)
    .map(([key, value]) => [String(key), String(value)] as [string, string])
    .sort(([left], [right]) => left.localeCompare(right, 'es'));
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function shouldTouchFreshness(value: string | null | undefined, now: Date, intervalMs: number): boolean {
  const previousTimestamp = toTimestamp(value);
  if (previousTimestamp === null) return true;
  return now.getTime() - previousTimestamp >= intervalMs;
}

export function buildProductContentSignature(input: ProductSignatureInput): string {
  return hashPayload([
    input.name,
    input.category,
    input.brand,
    input.model,
    input.description ?? null,
    input.image ?? null,
    input.normalized_title ?? null,
    input.canonical_product_key ?? null,
    input.family_key ?? null,
    input.variant_key ?? null,
    input.refresh_priority,
    normalizeSpecs(input.specs ?? {}),
    input.lowest_price,
    input.highest_price,
    input.average_price,
  ]);
}

export function buildPriceStateSignature(input: PriceSignatureInput): string {
  return hashPayload([
    input.price,
    input.original_price ?? null,
    input.stock,
    input.installment_count ?? null,
    input.installment_amount ?? null,
  ]);
}

export function buildProductPriceRowKey(input: {
  product_id: string;
  store_id: string;
  url: string;
}): string {
  return `${input.product_id}|${input.store_id}|${input.url}`;
}

export function planProductRowPersistence(
  nextRow: ProductSignatureInput,
  existingRow: ProductExistingState | undefined,
  now: Date,
): { contentSignature: string; shouldUpsert: boolean; changed: boolean } {
  const contentSignature = buildProductContentSignature(nextRow);
  if (!existingRow) {
    return { contentSignature, shouldUpsert: true, changed: true };
  }

  const changed = existingRow.content_signature !== contentSignature;
  if (changed) {
    return { contentSignature, shouldUpsert: true, changed: true };
  }

  const shouldUpsert = shouldTouchFreshness(existingRow.last_seen_at, now, PRODUCT_TOUCH_INTERVAL_MS)
    || shouldTouchFreshness(existingRow.last_scraped_at, now, PRODUCT_TOUCH_INTERVAL_MS);

  return { contentSignature, shouldUpsert, changed: false };
}

export function planPriceRowPersistence(
  nextRow: PriceSignatureInput,
  existingRow: PriceExistingState | undefined,
  now: Date,
  observedAt = now,
): { stateSignature: string; shouldUpsert: boolean; changed: boolean } {
  const stateSignature = buildPriceStateSignature(nextRow);
  if (!existingRow) {
    return { stateSignature, shouldUpsert: true, changed: true };
  }

  const previousObservation = toTimestamp(existingRow.last_updated);
  const newObservation = observedAt.getTime();
  // Una respuesta de scraper anterior a lo ya confirmado no debe retroceder
  // ni el precio ni su fecha, incluso si la revisión de identidad cambió.
  if (previousObservation !== null && newObservation < previousObservation) {
    return { stateSignature, shouldUpsert: false, changed: false };
  }

  const changed = existingRow.state_signature !== stateSignature;
  if (changed) {
    return { stateSignature, shouldUpsert: true, changed: true };
  }

  // Persistir la revisión aunque el precio no cambie, sin inventar un evento de historial.
  const reviewChanged = nextRow.identity_review !== undefined
    && JSON.stringify(nextRow.identity_review) !== JSON.stringify(existingRow.identity_review ?? null);
  const observedLater = Number.isFinite(newObservation)
    && newObservation <= now.getTime() + 60_000
    && (previousObservation === null || newObservation > previousObservation);
  const shouldUpsert = reviewChanged
    || (observedLater && shouldTouchFreshness(existingRow.last_updated, now, PRICE_TOUCH_INTERVAL_MS));
  return { stateSignature, shouldUpsert, changed: false };
}
