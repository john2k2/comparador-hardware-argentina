import { stores } from '@/lib/scrapers/static-data';
import { listingSourcePolicyValue } from '@/lib/scrapers/source-contracts';
import { toNumber, toStockStatus } from '@/lib/persistence/product-read-helpers';
import { computeComparablePriceStats, pickBestStorePrices } from '@/lib/price-utils';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { isHardwareCategory } from './hardware-categories';
import type { DbProductPriceRow, DbProductRow } from '@/lib/persistence/product-read-types';
import type { Product, ProductPrice } from '@/lib/types';

export const PREPARED_PRODUCT_NAMESPACE = 'comparador-hardware:prepared-product:v1';
export const PREPARED_PRODUCT_MAX_BYTES = 131072;
export const PREPARED_PRODUCT_MAX_OFFERS = 200;
export const PREPARED_PRODUCT_STORAGE_VERSION = 2;
export const PREPARED_PRODUCT_MAX_TRANSPORT_BYTES = PREPARED_PRODUCT_MAX_BYTES * 2 + 1024;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type PreparedPatch = { set: Record<string, Json>; unset: string[] };
export type PreparedOffer = { inputHash: string; output: PreparedPatch | null; reviewAllowed: boolean; identityAllowed: boolean };
export type PreparedRegistryContext = [storeId: string, url: string | null, codecName: string][];
export type PreparedProductRecord = { version: 2; policy: string; inputHash: string; registry: PreparedRegistryContext; product: PreparedPatch; offers: PreparedOffer[] };
export type PreparedProductEnvelope = {
  version: 1; productId: string; policy: string; inputHash: string; transportSeal: string; payload: string; signature: string;
};
export type UnsignedPreparedProduct = Omit<PreparedProductEnvelope, 'signature'>;
export type PreparedProductResult = {
  product: Product; current: { count: number; lowest: number; highest: number; average: number }; clock: number;
};
const names = new Map(stores.flatMap(store => {
  const id = Object.getOwnPropertyDescriptor(store, 'id'), name = Object.getOwnPropertyDescriptor(store, 'name');
  return id && Object.hasOwn(id, 'value') && typeof id.value === 'string' && name && Object.hasOwn(name, 'value') && typeof name.value === 'string'
    ? [[id.value as string, name.value as string] as const] : [];
}));
const hashPattern = /^[a-f0-9]{64}$/;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const productFields = new Set(['id', 'name', 'category', 'brand', 'model', 'description', 'image', 'normalizedTitle',
  'canonicalProductKey', 'familyKey', 'variantKey', 'refreshPriority', 'lastScrapedAt', 'lastNormalizedAt', 'specs', 'createdAt', 'updatedAt']);
const priceFields = new Set(['storeId', 'storeName', 'url', 'price', 'originalPrice', 'stock', 'sourceIdentity', 'priceCondition',
  'installment', 'lastUpdated', 'identityReview']);
function failure(code: string): never { throw new Error(`PREPARED_PRODUCT_${code}`); }
const bytes = (text: string) => new TextEncoder().encode(text);

function object(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && !Object.getOwnPropertySymbols(value).length
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value') && d.enumerable);
}
function assertJson(value: unknown, depth = 0): asserts value is Json {
  if (depth > 24) failure('JSON');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length
      || Object.keys(value).length !== value.length) failure('JSON');
    for (let i = 0; i < value.length; i++) {
      if (!descriptors[i] || !Object.hasOwn(descriptors[i], 'value')) failure('JSON');
      assertJson(descriptors[i].value, depth + 1);
    }
    return;
  }
  if (!object(value)) failure('JSON');
  for (const [key, child] of Object.entries(value)) { if (forbidden.has(key)) failure('JSON'); assertJson(child, depth + 1); }
}
function json(value: unknown): string { assertJson(value); return JSON.stringify(value); }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function date(value: unknown): Date {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return failure('DATE');
  return new Date(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) failure('SHAPE');
}
function validId(id: unknown): id is string { return typeof id === 'string' && id.length > 0 && id.length <= 256; }
async function hashBytes(value: Uint8Array<ArrayBuffer>): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function preparedProductHash(value: unknown): Promise<string> { return hashBytes(bytes(json(value))); }
export function preparedProductInput(row: DbProductRow): Record<string, unknown> {
  assertJson(row);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !['product_prices', 'lowest_price', 'highest_price', 'average_price',
    'catalog_name', 'catalog_document', 'catalog_identity', 'catalog_component'].includes(key)));
}
export function preparedProductCodec(row: DbProductRow): Record<string, unknown> {
  return copy({ id: row.id, name: row.name, category: row.category, brand: row.brand ?? 'Generica', model: row.model || row.name,
    description: row.description ?? row.name, image: row.image ?? '/pixel-box.svg', normalizedTitle: row.normalized_title ?? row.name,
    canonicalProductKey: row.canonical_product_key ?? undefined, familyKey: row.family_key ?? undefined, variantKey: row.variant_key ?? undefined,
    refreshPriority: row.refresh_priority ?? undefined, lastScrapedAt: row.last_scraped_at ? date(row.last_scraped_at).toISOString() : undefined,
    lastNormalizedAt: row.last_normalized_at ? date(row.last_normalized_at).toISOString() : null, specs: row.specs ?? {},
    prices: [], lowestPrice: 0, highestPrice: 0, averagePrice: 0, createdAt: date(row.created_at).toISOString(), updatedAt: date(row.updated_at).toISOString() });
}
export function preparedPriceCodec(raw: DbProductPriceRow): Record<string, unknown> {
  const amount = toNumber(raw.installment_amount, 0), count = raw.installment_count;
  return copy({ storeId: raw.store_id, storeName: names.get(raw.store_id) ?? raw.store_id, url: raw.url, price: toNumber(raw.price, 0),
    originalPrice: raw.original_price === null ? undefined : toNumber(raw.original_price, 0), stock: toStockStatus(raw.stock),
    sourceIdentity: raw.source_identity ?? undefined, priceCondition: raw.price_condition ?? undefined,
    installment: count && count > 0 ? { count, amount, totalAmount: count * amount, interest: false } : null,
    lastUpdated: raw.last_updated && Number.isFinite(Date.parse(raw.last_updated)) ? new Date(raw.last_updated).toISOString() : new Date(0).toISOString(),
    identityReview: raw.identity_review ?? undefined });
}
/** byId conserva refs originales; el array exportado puede reemplazar sus objetos. */
export function preparedProductRegistryContext(storeIds: readonly string[]): PreparedRegistryContext {
  const ids = [...new Set(storeIds)].sort();
  if (!ids.length) return [];
  const current = new Map<string, object>(), duplicates = new Set<string>();
  // Capturar una vez por llamada; nada se reutiliza a través de awaits.
  for (let index = 0; index < stores.length; index++) {
    const item = Object.getOwnPropertyDescriptor(stores, String(index));
    if (!item || !Object.hasOwn(item, 'value') || item.value === null || typeof item.value !== 'object') failure('REGISTRY');
    const store = item.value, key = Object.getOwnPropertyDescriptor(store, 'id');
    if (!key || !Object.hasOwn(key, 'value') || typeof key.value !== 'string') failure('REGISTRY');
    if (current.has(key.value)) duplicates.add(key.value); else current.set(key.value, store);
  }
  return ids.map(id => {
    if (!validId(id)) failure('REGISTRY');
    const policy = listingSourcePolicyValue(id), name = names.get(id) ?? id;
    if (!policy.cacheSafe || policy.url !== null && policy.url.length > 2048 || name.length > 400) failure('REGISTRY');
    const store = current.get(id);
    if (duplicates.has(id)) failure('REGISTRY');
    if (store) {
      const url = Object.getOwnPropertyDescriptor(store, 'url'), label = Object.getOwnPropertyDescriptor(store, 'name');
      if (!url || !Object.hasOwn(url, 'value') || url.value !== policy.url || !label || !Object.hasOwn(label, 'value') || label.value !== name) failure('REGISTRY');
    }
    if (policy.url !== null && !store) failure('REGISTRY');
    return [id, policy.url, name];
  });
}
export function assertPreparedProductRegistry(context: PreparedRegistryContext): void {
  if (JSON.stringify(preparedProductRegistryContext(context.map(entry => entry[0]))) !== JSON.stringify(context)) failure('REGISTRY');
}
function validatePatch(value: unknown, fields: Set<string>): asserts value is PreparedPatch {
  assertJson(value);
  if (!object(value)) failure('PATCH'); exactKeys(value, ['set', 'unset']);
  if (!object(value.set) || !Array.isArray(value.unset) || value.unset.some(key => typeof key !== 'string')) failure('PATCH');
  const keys = [...Object.keys(value.set), ...value.unset as string[]];
  if (keys.some(key => forbidden.has(key) || !fields.has(key)) || new Set(keys).size !== keys.length) failure('PATCH');
  assertJson(value.set);
}
export function preparedProductPatch(before: Record<string, unknown>, after: Record<string, unknown>, kind: 'product' | 'price'): PreparedPatch {
  const patch = { set: Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value))),
    unset: Object.keys(before).filter(key => !Object.hasOwn(after, key)) };
  validatePatch(patch, kind === 'product' ? productFields : priceFields); return patch;
}
function applyPatch(base: Record<string, unknown>, patch: PreparedPatch): Record<string, unknown> {
  const result = copy(base); for (const key of patch.unset) delete result[key];
  for (const [key, value] of Object.entries(patch.set)) Object.defineProperty(result, key, { value: copy(value), enumerable: true, configurable: true, writable: true });
  return result;
}
export function preparedProductSignatureMessage(value: Pick<UnsignedPreparedProduct, 'productId' | 'policy' | 'inputHash' | 'transportSeal'>): Uint8Array<ArrayBuffer> {
  if (!validId(value.productId) || typeof value.policy !== 'string' || typeof value.inputHash !== 'string' || typeof value.transportSeal !== 'string'
    || !hashPattern.test(value.policy) || !hashPattern.test(value.inputHash) || !hashPattern.test(value.transportSeal)) failure('HEADER');
  return bytes(JSON.stringify([PREPARED_PRODUCT_NAMESPACE, value.productId, value.policy, value.inputHash, value.transportSeal]));
}
export async function importPreparedProductPublicKey(raw: Uint8Array<ArrayBuffer>, expectedKeyId: string): Promise<CryptoKey> {
  if (!(raw instanceof Uint8Array) || raw.byteLength !== 32 || !hashPattern.test(expectedKeyId) || await hashBytes(raw) !== expectedKeyId) failure('KEY_ID');
  return crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
}
export async function preparedProductPublicKeyId(raw: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!(raw instanceof Uint8Array) || raw.byteLength !== 32) failure('KEY_ID'); return hashBytes(raw);
}
export async function createUnsignedPreparedProduct(productId: string, record: PreparedProductRecord): Promise<UnsignedPreparedProduct> {
  validateRecord(record); const payload = json(record);
  if (bytes(payload).length > PREPARED_PRODUCT_MAX_BYTES) failure('SIZE');
  const result = { version: 1 as const, productId, policy: record.policy, inputHash: record.inputHash, payload, transportSeal: await hashBytes(bytes(payload)) };
  preparedProductSignatureMessage(result); return result;
}
function validateRecord(value: unknown): asserts value is PreparedProductRecord {
  assertJson(value);
  if (!object(value)) failure('SHAPE'); exactKeys(value, ['version', 'policy', 'inputHash', 'registry', 'product', 'offers']);
  if (value.version !== 2 || typeof value.policy !== 'string' || !hashPattern.test(value.policy)
    || typeof value.inputHash !== 'string' || !hashPattern.test(value.inputHash) || !Array.isArray(value.offers)
    || value.offers.length > PREPARED_PRODUCT_MAX_OFFERS) failure('SHAPE');
  if (!Array.isArray(value.registry) || value.registry.length > PREPARED_PRODUCT_MAX_OFFERS) failure('REGISTRY');
  let previous = '';
  for (const entry of value.registry) {
    if (!Array.isArray(entry) || entry.length !== 3 || !validId(entry[0]) || entry[0] <= previous
      || entry[1] !== null && (typeof entry[1] !== 'string' || entry[1].length > 2048) || typeof entry[2] !== 'string' || entry[2].length > 400) failure('REGISTRY');
    previous = entry[0];
  }
  validatePatch(value.product, productFields);
  for (const offer of value.offers) {
    if (!object(offer)) failure('SHAPE'); exactKeys(offer, ['inputHash', 'output', 'reviewAllowed', 'identityAllowed']);
    if (typeof offer.inputHash !== 'string' || !hashPattern.test(offer.inputHash) || typeof offer.reviewAllowed !== 'boolean' || typeof offer.identityAllowed !== 'boolean') failure('SHAPE');
    if (offer.output !== null) validatePatch(offer.output, priceFields);
    else if (offer.reviewAllowed || offer.identityAllowed) failure('SHAPE');
  }
}
function decodeSignature(value: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(value)) failure('SIGNATURE');
  const result = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (result.length !== 64 || btoa(String.fromCharCode(...result)) !== value) failure('SIGNATURE'); return result;
}
/** Sólo reconstruye transporte. Los flags QC se usan después del verify del consumer. */
export async function decodePreparedProductTransport(productId: string, policy: string, storedJSON: string): Promise<PreparedProductEnvelope> {
  if (!validId(productId) || typeof policy !== 'string' || !hashPattern.test(policy) || typeof storedJSON !== 'string'
    || storedJSON.length > PREPARED_PRODUCT_MAX_TRANSPORT_BYTES || bytes(storedJSON).length > PREPARED_PRODUCT_MAX_TRANSPORT_BYTES) failure('TRANSPORT');
  let transport: unknown; try { transport = JSON.parse(storedJSON); } catch { return failure('TRANSPORT'); }
  if (!Array.isArray(transport) || transport.length !== 2 || typeof transport[0] !== 'string' || typeof transport[1] !== 'string') failure('TRANSPORT');
  const [payload, signature] = transport;
  if (payload.length > PREPARED_PRODUCT_MAX_BYTES || bytes(payload).length > PREPARED_PRODUCT_MAX_BYTES) failure('SIZE');
  decodeSignature(signature);
  let header: unknown; try { header = JSON.parse(payload); } catch { return failure('TRANSPORT'); }
  if (!object(header) || header.version !== 2 || header.policy !== policy || typeof header.inputHash !== 'string' || !hashPattern.test(header.inputHash)) failure('TRANSPORT');
  // ID/policy son externos. Un body alterado cambia este seal y exige otra firma.
  return { version: 1, productId, policy, inputHash: header.inputHash, payload, transportSeal: await hashBytes(bytes(payload)), signature };
}
function reviveProduct(value: Record<string, unknown>, id: string): Product {
  if (value.id !== id || typeof value.name !== 'string' || !value.name || typeof value.category !== 'string' || !isHardwareCategory(value.category)
    || typeof value.brand !== 'string' || typeof value.model !== 'string' || !object(value.specs)
    || Object.values(value.specs).some(spec => typeof spec !== 'string')) failure('PRODUCT');
  for (const key of ['createdAt', 'updatedAt']) value[key] = date(value[key]);
  for (const key of ['lastScrapedAt', 'lastNormalizedAt']) if (value[key] !== undefined && value[key] !== null) value[key] = date(value[key]);
  return value as unknown as Product;
}
function revivePrice(value: Record<string, unknown>): ProductPrice {
  if (typeof value.storeId !== 'string' || !value.storeId || typeof value.storeName !== 'string' || typeof value.url !== 'string'
    || typeof value.price !== 'number' || !Number.isFinite(value.price) || value.price <= 0
    || !['in-stock', 'low-stock', 'out-of-stock', 'unknown'].includes(String(value.stock))) failure('PRICE');
  value.lastUpdated = date(value.lastUpdated); return value as unknown as ProductPrice;
}
/** La key/política provienen del controlplane. Manifest y generación pertenecen al lector. */
export async function consumePreparedProduct(inputRow: DbProductRow, inputEnvelope: PreparedProductEnvelope,
  options: { publicKey: CryptoKey; policy: string; now?: number | (() => number) }): Promise<PreparedProductResult> {
  if (!object(inputEnvelope)) failure('HEADER'); exactKeys(inputEnvelope, ['version', 'productId', 'policy', 'inputHash', 'transportSeal', 'payload', 'signature']);
  if (typeof inputEnvelope.payload !== 'string' || bytes(inputEnvelope.payload).length > PREPARED_PRODUCT_MAX_BYTES) failure('HEADER');
  // Ningún await conserva objetos mutables del caller como fuente de verdad.
  const envelope = copy(inputEnvelope), row = JSON.parse(json(inputRow)) as DbProductRow;
  const key = options.publicKey, policy = options.policy, clockSource = options.now;
  const beforeRegistry = preparedProductRegistryContext((row.product_prices ?? []).map(price => price.store_id));
  if (envelope.version !== 1 || envelope.productId !== row.id || envelope.policy !== policy || typeof policy !== 'string' || !hashPattern.test(policy)) failure('HEADER');
  if (!key || key.type !== 'public' || key.algorithm.name !== 'Ed25519' || key.extractable || key.usages.length !== 1 || key.usages[0] !== 'verify') failure('KEY');
  const signature = decodeSignature(envelope.signature), message = preparedProductSignatureMessage(envelope);
  if (!await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message)) failure('SIGNATURE');
  if (await hashBytes(bytes(envelope.payload)) !== envelope.transportSeal) failure('SEAL');
  let parsed: unknown; try { parsed = JSON.parse(envelope.payload); } catch { return failure('JSON'); }
  validateRecord(parsed); const record = parsed;
  const contexts = new Map(record.registry.map(entry => [entry[0], entry]));
  if (beforeRegistry.some(entry => JSON.stringify(contexts.get(entry[0])) !== JSON.stringify(entry))) failure('REGISTRY');
  assertPreparedProductRegistry(record.registry);
  if (record.policy !== policy || record.inputHash !== envelope.inputHash) failure('HEADER');
  if (await preparedProductHash(preparedProductInput(row)) !== record.inputHash) failure('SUBJECT');
  const raw = row.product_prices ?? [];
  if (!Array.isArray(raw) || raw.length > PREPARED_PRODUCT_MAX_OFFERS) failure('OFFERS');
  const hashes = await Promise.all(raw.map(preparedProductHash)), used = new Set<number>();
  const product = reviveProduct(applyPatch(preparedProductCodec(row), record.product), row.id), prices: ProductPrice[] = [];
  const reviewed = new Set<ProductPrice>(), identified = new Set<ProductPrice>();
  for (let i = 0; i < raw.length; i++) {
    const index = record.offers.findIndex((offer, index) => !used.has(index) && offer.inputHash === hashes[i]);
    if (index < 0) failure('SOURCE'); used.add(index); const offer = record.offers[index];
    if (offer.output === null) {
      if (raw[i].store_id && toNumber(raw[i].price, 0) > 0) failure('MISSING_OFFER');
      continue;
    }
    const price = revivePrice(applyPatch(preparedPriceCodec(raw[i]), offer.output)); prices.push(price);
    const observedAt = raw[i].last_updated && Number.isFinite(Date.parse(raw[i].last_updated!)) ? Date.parse(raw[i].last_updated!) : 0;
    if (price.price !== toNumber(raw[i].price, 0) || price.stock !== toStockStatus(raw[i].stock)
      || price.lastUpdated.getTime() !== observedAt) failure('OBSERVATION');
    if (offer.reviewAllowed) reviewed.add(price); if (offer.identityAllowed) identified.add(price);
  }
  // Capturar DESPUÉS de crypto/hashes: una espera no extiende la frescura.
  const clock = typeof clockSource === 'function' ? clockSource() : clockSource ?? Date.now();
  if (!Number.isFinite(clock)) failure('CLOCK');
  assertPreparedProductRegistry(record.registry);
  const best = pickBestStorePrices(prices.filter(price => reviewed.has(price)), clock), available = best.filter(price => price.stock !== 'out-of-stock');
  const historical = computeComparablePriceStats(available.length ? available : best);
  const current = computeComparablePriceStats(pickBestStorePrices(prices.filter(price => identified.has(price) && price.price > 0
    && ['in-stock', 'low-stock'].includes(price.stock) && isCatalogOfferFresh(price.lastUpdated, clock)), clock));
  const effective = current.comparablePrices.length ? current : historical; product.prices = prices;
  product.lowestPrice = prices.length ? effective.lowest : toNumber(row.lowest_price, 0);
  product.highestPrice = prices.length ? effective.highest : toNumber(row.highest_price, 0);
  product.averagePrice = prices.length ? effective.average : toNumber(row.average_price, 0);
  return { product, current: { count: current.comparablePrices.length, lowest: current.lowest, highest: current.highest, average: current.average }, clock };
}
export const consumeSignedPreparedProduct = consumePreparedProduct;
