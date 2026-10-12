import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { prepareProductRecord, prepareUnsignedProduct } from '../../../scripts/pilots/cloudflare-catalog/prepared-product-builder';
import { mapDbGuideProduct } from '@/lib/persistence/product-read-mapper';
import { catalogPageResponse } from '@/lib/search/catalog-page-response';
import { stores } from '@/lib/scrapers/static-data';
import { listingSourcePolicyValue } from '@/lib/scrapers/source-contracts';
import { computeCurrentStorePriceStats } from '@/lib/price-utils';
import { normalizeIdentityText } from '@/lib/product-identity';
import { proveManufacturerRamAttributes } from '@/lib/quality/offer-attribute-proof';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { consumePreparedProduct, createUnsignedPreparedProduct, decodePreparedProductTransport, importPreparedProductPublicKey, preparedProductPublicKeyId,
  PREPARED_PRODUCT_MAX_BYTES, PREPARED_PRODUCT_MAX_TRANSPORT_BYTES,
  preparedProductSignatureMessage, preparedProductRegistryContext, PREPARED_PRODUCT_NAMESPACE, type PreparedRegistryContext,
  type PreparedProductEnvelope, type PreparedProductRecord, type UnsignedPreparedProduct } from './prepared-product';

const now = Date.parse('2026-10-12T12:00:00Z'), policy = 'a'.repeat(64), stamp = new Date(now).toISOString();
let pair: CryptoKeyPair, key: CryptoKey, rawKey: Uint8Array<ArrayBuffer>, keyId: string;
beforeAll(async () => {
  pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  keyId = await preparedProductPublicKeyId(rawKey); key = await importPreparedProductPublicKey(rawKey, keyId);
});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const options = () => ({ publicKey: key, policy, now });
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const registryNames = new Map(stores.map(store => [store.id, store.name]));
// Referencia del corte anterior: sólo test, sin memo ni otra política de hosts.
function oldRegistryContext(storeIds: readonly string[]): PreparedRegistryContext {
  const fail = (): never => { throw new Error('PREPARED_PRODUCT_REGISTRY'); };
  return [...new Set(storeIds)].sort().map(id => {
    if (typeof id !== 'string' || !id || id.length > 256) fail();
    const policy = listingSourcePolicyValue(id), name = registryNames.get(id) ?? id;
    if (!policy.cacheSafe || policy.url !== null && policy.url.length > 2048 || name.length > 400) fail();
    let found = false;
    for (let index = 0; index < stores.length; index++) {
      const item = Object.getOwnPropertyDescriptor(stores, String(index));
      if (!item || !Object.hasOwn(item, 'value') || item.value === null || typeof item.value !== 'object') fail();
      const store = item.value, key = Object.getOwnPropertyDescriptor(store, 'id');
      if (!key || !Object.hasOwn(key, 'value') || typeof key.value !== 'string') fail();
      if (key.value !== id) continue;
      if (found) fail(); found = true;
      const url = Object.getOwnPropertyDescriptor(store, 'url'), label = Object.getOwnPropertyDescriptor(store, 'name');
      if (!url || !Object.hasOwn(url, 'value') || url.value !== policy.url || !label || !Object.hasOwn(label, 'value') || label.value !== name) fail();
    }
    if (policy.url !== null && !found) fail();
    return [id, policy.url, name];
  });
}
const registryIds = stores.map(store => store.id), registryCases = Array.from({ length: 256 }, (_, mask) => registryIds.slice(0, 8).filter((_, index) => mask & 1 << index));
registryCases.push(registryIds, ['venex'], ['unknown-store'], ['venex', 'unknown-store'], ['venex', 'venex', registryIds[0]], [...registryIds].reverse());
function registryOutcome(fn: (ids: readonly string[]) => PreparedRegistryContext, ids: readonly string[]) {
  try { return { value: fn(ids) }; } catch (error) { return { error: (error as Error).message }; }
}
function row(overrides: Partial<DbProductRow> = {}): DbProductRow {
  return { id: 'gpu', name: 'NVIDIA RTX 4060 8GB', category: 'tarjetas-graficas', brand: 'NVIDIA', model: 'RTX 4060',
    description: null, image: null, normalized_title: null, canonical_product_key: null, family_key: null, variant_key: null,
    refresh_priority: null, last_scraped_at: stamp, last_normalized_at: null, specs: {}, lowest_price: 100000,
    highest_price: 100000, average_price: 100000, created_at: stamp, updated_at: stamp,
    product_prices: [{ store_id: 'venex', url: 'https://www.venex.com.ar/rtx-4060-8gb', price: 100000,
      original_price: null, stock: 'in-stock', installment_count: null, installment_amount: null, last_updated: stamp }], ...overrides };
}
async function sign(unsigned: UnsignedPreparedProduct, signing = pair.privateKey): Promise<PreparedProductEnvelope> {
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signing, preparedProductSignatureMessage(unsigned)));
  return { ...unsigned, signature: btoa(String.fromCharCode(...signature)) };
}
async function envelope(input: DbProductRow) { return sign(await prepareUnsignedProduct(input, policy)); }
function ram(name: string, sku: string, ref: string): DbProductRow {
  const url = `https://compragamer.com/producto/RAM_${ref}`, listingRef = `compragamer:id:${ref}`;
  const subject = { title: name, sku, specs: { SKU: sku } }, source = { title: name, storeSku: sku, listingRef };
  return row({ id: `cg-${ref}`, name, category: 'memoria-ram', brand: 'Corsair', model: name, specs: { SKU: sku },
    product_prices: [{ store_id: 'compragamer', url, price: 283600, original_price: null, stock: 'in-stock',
      installment_count: null, installment_amount: null, last_updated: stamp, source_identity: source,
      identity_review: { version: 1, status: 'consistent', reason: 'manufacturer-ram', reviewedAt: stamp, model: null, confidence: null,
        subject: { name: normalizeIdentityText(name), category: 'memoria-ram', url }, sourceIdentity: source,
        proof: proveManufacturerRamAttributes(subject, subject, { storeId: 'compragamer', url, listingRef }) } }] });
}

describe('prepared product firmado, sin credenciales reales', () => {
  it('firma el array canónico y exige keyID externo; key importada sólo verifica', async () => {
    const unsigned = await prepareUnsignedProduct(row(), policy);
    expect(JSON.parse(new TextDecoder().decode(preparedProductSignatureMessage(unsigned)))).toEqual([
      PREPARED_PRODUCT_NAMESPACE, 'gpu', policy, unsigned.inputHash, unsigned.transportSeal,
    ]);
    expect(key.type).toBe('public'); expect(key.extractable).toBe(false); expect(key.usages).toEqual(['verify']);
    await expect(importPreparedProductPublicKey(rawKey, 'b'.repeat(64))).rejects.toThrow('KEY_ID');
    await expect(importPreparedProductPublicKey(rawKey.slice(1), keyId)).rejects.toThrow('KEY_ID');
    await expect(crypto.subtle.sign({ name: 'Ed25519' }, key, new Uint8Array())).rejects.toThrow();
  });
  it('paridad JSON, fechas Date y current independiente de un resumen SQL positivo', async () => {
    const input = row(), ready = await envelope(input), result = await consumePreparedProduct(input, ready, options());
    expect(json(result.product)).toEqual(json(mapDbGuideProduct(input)));
    expect(result.product.createdAt).toBeInstanceOf(Date); expect(result.product.prices[0].lastUpdated).toBeInstanceOf(Date);
    expect(result.current).toEqual({ count: 1, lowest: 100000, highest: 100000, average: 100000 }); expect(result.clock).toBe(now);
    const noOffers = { ...input, product_prices: null }; const empty = await consumePreparedProduct(noOffers, await envelope(noOffers), options());
    expect(empty.product.lowestPrice).toBe(100000); expect(empty.current).toEqual({ count: 0, lowest: 0, highest: 0, average: 0 });
  });
  it('transporte compacto reconstruye envelope exacto y conserva JSON/fechas/current', async () => {
    for (const input of [row(), row({ product_prices: null }), ram('Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX Black CL16', 'CMK8GX4M1E3200C16', '15522')]) {
      const full = await envelope(input), stored = JSON.stringify([full.payload, full.signature]);
      const decoded = await decodePreparedProductTransport(input.id, policy, stored);
      expect(decoded).toEqual(full);
      const actual = await consumePreparedProduct(input, decoded, options());
      expect(json(actual)).toEqual(json(await consumePreparedProduct(input, full, options())));
      expect(actual.product.createdAt).toBeInstanceOf(Date);
    }
  });
  it('transport body+selfseal automático, inputHash e IDs/policy externos no falsifican firma', async () => {
    const input = row(), full = await envelope(input), encode = (payload: string) => JSON.stringify([payload, full.signature]);
    const forged = await decodePreparedProductTransport(input.id, policy, encode(full.payload.replace('true', 'false')));
    expect(forged.transportSeal).not.toBe(full.transportSeal);
    await expect(consumePreparedProduct(input, forged, options())).rejects.toThrow('SIGNATURE');
    const body = JSON.parse(full.payload); body.inputHash = 'f'.repeat(64);
    await expect(consumePreparedProduct(input, await decodePreparedProductTransport(input.id, policy, encode(JSON.stringify(body))), options())).rejects.toThrow('SIGNATURE');
    const moved = await decodePreparedProductTransport('other', policy, encode(full.payload));
    await expect(consumePreparedProduct({ ...input, id: 'other' }, moved, options())).rejects.toThrow('SIGNATURE');
    await expect(decodePreparedProductTransport(input.id, 'b'.repeat(64), encode(full.payload))).rejects.toThrow('TRANSPORT');
    body.inputHash = full.inputHash; body.policy = 'b'.repeat(64);
    await expect(consumePreparedProduct(input, await decodePreparedProductTransport(input.id, body.policy, encode(JSON.stringify(body))), { ...options(), policy: body.policy })).rejects.toThrow('SIGNATURE');
  });
  it('transport rechaza shapes, full-envelope heredado, encabezados ausentes y base64 inválido', async () => {
    const full = await envelope(row());
    for (const stored of ['broken', 'null', '{}', JSON.stringify(full), JSON.stringify([full.payload]), JSON.stringify([full.payload, full.signature, 'extra']),
      JSON.stringify([null, full.signature]), JSON.stringify([{}, full.signature])])
      await expect(decodePreparedProductTransport('gpu', policy, stored)).rejects.toThrow('TRANSPORT');
    for (const payload of ['null', '[]', '{}', JSON.stringify({ version: 2, policy, inputHash: 'wrong' })])
      await expect(decodePreparedProductTransport('gpu', policy, JSON.stringify([payload, full.signature]))).rejects.toThrow('TRANSPORT');
    await expect(decodePreparedProductTransport('gpu', policy, JSON.stringify([full.payload, 'A'.repeat(88)]))).rejects.toThrow('SIGNATURE');
    await expect(decodePreparedProductTransport('', policy, JSON.stringify([full.payload, full.signature]))).rejects.toThrow('TRANSPORT');
  });
  it('transport bounds UTF8 y parámetros no-string no ejecutan getters/prototype/toJSON', async () => {
    const full = await envelope(row());
    await expect(decodePreparedProductTransport('gpu', policy, ' '.repeat(PREPARED_PRODUCT_MAX_TRANSPORT_BYTES + 1))).rejects.toThrow('TRANSPORT');
    for (const payload of ['x'.repeat(PREPARED_PRODUCT_MAX_BYTES + 1), 'é'.repeat(PREPARED_PRODUCT_MAX_BYTES / 2 + 1)])
      await expect(decodePreparedProductTransport('gpu', policy, JSON.stringify([payload, full.signature]))).rejects.toThrow('SIZE');
    const getter = vi.fn(() => full.payload), array: unknown[] = []; Object.defineProperty(array, '0', { enumerable: true, get: getter });
    const toJSON = vi.fn(() => [full.payload, full.signature]);
    for (const invalid of [array, { toJSON }, Object.create({ payload: full.payload }), new String(JSON.stringify([full.payload, full.signature]))])
      await expect(decodePreparedProductTransport('gpu', policy, invalid as string)).rejects.toThrow('TRANSPORT');
    expect(getter).not.toHaveBeenCalled(); expect(toJSON).not.toHaveBeenCalled();
  });
  it('subconjunto de tiendas/empty conserva JSON y no habilita ofertas ausentes', async () => {
    const input = row(); input.product_prices!.push({ ...input.product_prices![0], store_id: 'mexx', url: 'https://www.mexx.com.ar/rtx-4060', price: 150000 });
    const ready = await envelope(input);
    for (const offers of [input.product_prices!.slice(1), []]) {
      const selected = { ...input, product_prices: offers }, result = await consumePreparedProduct(selected, ready, options());
      expect(json(result.product)).toEqual(json(mapDbGuideProduct(selected))); expect(result.current.count).toBe(offers.length);
    }
  });
  it.each(['unknown', 'out-of-stock', 'backorder', null])('stock %s no se convierte en disponibilidad', async stock => {
    const input = row(); input.product_prices![0].stock = stock;
    const result = await consumePreparedProduct(input, await envelope(input), options());
    expect(result.current.count).toBe(0); expect(json(result.product)).toEqual(json(mapDbGuideProduct(input)));
  });
  it('precio cero, outliers y observación vigente conservan semántica del mapper', async () => {
    const input = row(); const price = input.product_prices![0];
    input.product_prices = [price, { ...price, store_id: 'mexx', url: 'https://www.mexx.com.ar/rtx-4060', price: 1000000 },
      { ...price, price: 0 }, { ...price, price: 1, last_updated: new Date(now - 25 * 3600000).toISOString() }];
    const result = await consumePreparedProduct(input, await envelope(input), options());
    expect(json(result.product)).toEqual(json(mapDbGuideProduct(input))); expect(result.current).toEqual({ count: 1, lowest: 100000, highest: 100000, average: 100000 });
  });
  it.each([
    ['Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16', 'CMG16GX4M1E3200C16', '15558'],
    ['Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX Black CL16', 'CMK8GX4M1E3200C16', '15522'],
    ['Memoria Corsair DDR5 16GB 5600MHz Vengeance Black CL40', 'CMK16GX5M1B5600C40', '16112'],
  ])('MPN %s conserva oferta elegible y rechaza SKU/kit/título actuales distintos', async (name, sku, ref) => {
    const input = ram(name, sku, ref), ready = await envelope(input), result = await consumePreparedProduct(input, ready, options());
    expect(result.current.count).toBe(1); expect(json(result.product)).toEqual(json(mapDbGuideProduct(input)));
    for (const changed of [{ ...input, specs: {} }, { ...input, specs: { SKU: 'wrong' } },
      { ...input, specs: { SKU: sku, kit: '2x8GB' } }, { ...input, name: name.replace('Black', 'White') }])
      await expect(consumePreparedProduct(changed, ready, options())).rejects.toThrow('SUBJECT');
  });
  it('pendientes se conservan: dictamen fabricante contradictorio jamás aporta current', async () => {
    const input = ram('Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX Black CL16', 'CMK8GX4M1E3200C16', '15522');
    input.product_prices![0].source_identity!.storeSku = 'wrong';
    const result = await consumePreparedProduct(input, await envelope(input), options());
    expect(result.product.prices).toHaveLength(1); expect(result.current.count).toBe(0); expect(json(result.product)).toEqual(json(mapDbGuideProduct(input)));
  });
  it('captura callback clock tras crypto/hashes y permite vencer exactamente durante verify', async () => {
    const input = row(), ready = await envelope(input); let clock = now;
    const verify = crypto.subtle.verify.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => { const result = await verify(...args); clock = now + 86400001; return result; });
    const getClock = vi.fn(() => clock), result = await consumePreparedProduct(input, ready, { ...options(), now: getClock });
    expect(getClock).toHaveBeenCalledTimes(1); expect(result.clock).toBe(now + 86400001); expect(result.current.count).toBe(0);
    vi.setSystemTime(clock); expect(json(result.product)).toEqual(json(mapDbGuideProduct(input)));
  });
  it('mutaciones del caller durante verify no cambian body ni precio/stock acreditados', async () => {
    const input = row(), original = json(input) as DbProductRow, ready = await envelope(input);
    const verify = crypto.subtle.verify.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
      const result = await verify(...args);
      input.product_prices![0].price = 1; input.product_prices![0].stock = 'unknown'; input.name = 'changed';
      ready.payload = ready.payload.replace('true', 'false'); ready.transportSeal = 'f'.repeat(64);
      return result;
    });
    const result = await consumePreparedProduct(input, ready, options());
    expect(json(result.product)).toEqual(json(mapDbGuideProduct(original))); expect(result.current.lowest).toBe(100000);
  });
  it('body+selfseal, namespace, producto, política y otra key no pueden falsificar admisión', async () => {
    const input = row(), ready = await envelope(input), forged = { ...ready, payload: ready.payload.replace('true', 'false') };
    forged.transportSeal = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(forged.payload)))].map(n => n.toString(16).padStart(2, '0')).join('');
    await expect(consumePreparedProduct(input, forged, options())).rejects.toThrow('SIGNATURE');
    await expect(consumePreparedProduct(input, { ...ready, payload: ready.payload + ' ' }, options())).rejects.toThrow('SEAL');
    await expect(consumePreparedProduct(input, { ...ready, productId: 'other' }, options())).rejects.toThrow('HEADER');
    await expect(consumePreparedProduct(input, ready, { ...options(), policy: 'b'.repeat(64) })).rejects.toThrow('HEADER');
    const wrong = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', wrong.publicKey));
    const wrongKey = await importPreparedProductPublicKey(raw, await preparedProductPublicKeyId(raw));
    await expect(consumePreparedProduct(input, ready, { ...options(), publicKey: wrongKey })).rejects.toThrow('SIGNATURE');
    const alien = new TextEncoder().encode(JSON.stringify(['other-namespace', ready.productId, policy, ready.inputHash, ready.transportSeal]));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, alien));
    await expect(consumePreparedProduct(input, { ...ready, signature: btoa(String.fromCharCode(...signature)) }, options())).rejects.toThrow('SIGNATURE');
  });
  it('toda mutación fuente precio/stock/fecha/SKU/condición/proof se rechaza', async () => {
    const input = row(), ready = await envelope(input);
    const changes = [{ price: 999 }, { stock: 'unknown' }, { last_updated: new Date(now + 1000).toISOString() }, { url: 'https://www.venex.com.ar/other' },
      { price_condition: 'special' }, { source_identity: { title: 'wrong', listingRef: 'wrong', storeSku: 'wrong' } }, { identity_review: { version: 1, status: 'consistent' } }];
    for (const change of changes) {
      const changed = { ...input, product_prices: [{ ...input.product_prices![0], ...change }] } as DbProductRow;
      await expect(consumePreparedProduct(changed, ready, options())).rejects.toThrow('SOURCE');
    }
  });
  it('patches fuera whitelist, pollution, getters y fechas inválidas fallan cerrados', async () => {
    const input = row(), record = await prepareProductRecord(input, policy);
    for (const key of ['__proto__', 'constructor', 'prototype', 'prices', 'lowestPrice', 'extra']) {
      const malformed = json(record) as PreparedProductRecord;
      Object.defineProperty(malformed.product.set, key, { value: 'wrong', enumerable: true });
      await expect(createUnsignedPreparedProduct(input.id, malformed)).rejects.toThrow(/PATCH|JSON/);
    }
    const malformed = json(record) as PreparedProductRecord; malformed.product.set.createdAt = 'invalid';
    const signed = await sign(await createUnsignedPreparedProduct(input.id, malformed));
    await expect(consumePreparedProduct(input, signed, options())).rejects.toThrow('DATE');
    const getter = { ...input }; Object.defineProperty(getter, 'name', { enumerable: true, get() { throw new Error('getter invoked'); } });
    await expect(prepareUnsignedProduct(getter, policy)).rejects.toThrow('JSON');
  });
  it('ni un payload firmado válido puede renovar fecha, stock o importe de la oferta raw', async () => {
    const input = row(), record = await prepareProductRecord(input, policy);
    for (const change of [{ price: 1 }, { stock: 'low-stock' }, { lastUpdated: new Date(now + 1000).toISOString() }]) {
      const changed = json(record) as PreparedProductRecord; Object.assign(changed.offers[0].output!.set, change);
      const signed = await sign(await createUnsignedPreparedProduct(input.id, changed));
      await expect(consumePreparedProduct(input, signed, options())).rejects.toThrow('OBSERVATION');
    }
    const hidden = json(record) as PreparedProductRecord;
    hidden.offers[0] = { ...hidden.offers[0], output: null, identityAllowed: false, reviewAllowed: false };
    await expect(consumePreparedProduct(input, await sign(await createUnsignedPreparedProduct(input.id, hidden)), options())).rejects.toThrow('MISSING_OFFER');
  });
  it('caps, base64 no canónico y datos mutables no escapan', async () => {
    const input = row(), ready = await envelope(input);
    await expect(consumePreparedProduct(input, { ...ready, signature: 'A'.repeat(88) }, options())).rejects.toThrow('SIGNATURE');
    await expect(consumePreparedProduct(input, { ...ready, payload: 'x'.repeat(131073) }, options())).rejects.toThrow('HEADER');
    const tooMany = { ...input, product_prices: Array.from({ length: 201 }, () => input.product_prices![0]) };
    await expect(prepareUnsignedProduct(tooMany, policy)).rejects.toThrow('OFFERS');
    const first = await consumePreparedProduct(input, ready, options()); first.product.name = 'mutated'; first.product.prices[0].price = 1;
    const next = await consumePreparedProduct(input, ready, options()); expect(json(next.product)).toEqual(json(mapDbGuideProduct(input)));
    await expect(consumePreparedProduct(input, ready, { ...options(), now: () => NaN })).rejects.toThrow('CLOCK');
  });
  it('formatter conserva alias y totales por página, sin fusionar globalmente', async () => {
    const cpu = row({ id: 'cpu-a', name: 'AMD Ryzen 5 5600 BOX con cooler', category: 'procesadores', brand: 'AMD', model: 'Ryzen 5 5600' });
    cpu.product_prices![0].url = 'https://www.venex.com.ar/amd-ryzen-5-5600-box';
    const rows = [cpu, { ...cpu, id: 'cpu-b' }], products = [];
    for (const input of rows) products.push((await consumePreparedProduct(input, await envelope(input), options())).product);
    for (const total of [2, 20]) {
      const page = { products, total, totalPages: Math.ceil(total / 12), page: 1, pageSize: 12 };
      expect(json(catalogPageResponse(page))).toEqual(json(catalogPageResponse({ ...page, products: rows.map(mapDbGuideProduct) })));
    }
  });
  it('registry URL drift reproduce QCcount0 y hace fail-closed la view aprobada', async () => {
    const input = row(), ready = await envelope(input), venex = stores.find(store => store.id === 'venex')!, url = venex.url;
    expect((await consumePreparedProduct(input, ready, options())).current.count).toBe(1);
    try {
      venex.url = 'https://other.example';
      expect(computeCurrentStorePriceStats(mapDbGuideProduct(input).prices, mapDbGuideProduct(input), now).comparablePrices).toHaveLength(0);
      await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY');
    } finally { venex.url = url; }
    expect((await consumePreparedProduct(input, ready, options())).current.count).toBe(1);
  });
  it('índice de registry conserva referencia anterior en 262 combinaciones', () => {
    expect(registryCases).toHaveLength(262);
    for (const ids of registryCases) expect(registryOutcome(preparedProductRegistryContext, ids)).toEqual(registryOutcome(oldRegistryContext, ids));
  });
  it('262 combinaciones con descriptores y mutaciones conservan rechazos y getters sin invocar', () => {
    const index = stores.findIndex(store => store.id === 'venex'), venex = stores[index], getter = vi.fn(() => 'not invoked');
    const mutations: (() => () => void)[] = [
      () => { stores.push({ ...venex }); return () => { stores.pop(); }; },
      () => { stores[index] = { ...venex, url: 'https://other.example' }; return () => { stores[index] = venex; }; },
      () => { stores[index] = { ...venex, name: 'Changed' }; return () => { stores[index] = venex; }; },
      () => { stores[index] = Object.create(venex); return () => { stores[index] = venex; }; },
      () => { stores.splice(index, 1); return () => { stores.splice(index, 0, venex); }; },
      ...(['id', 'url', 'name'] as const).map(field => () => {
        const descriptor = Object.getOwnPropertyDescriptor(venex, field)!;
        Object.defineProperty(venex, field, { configurable: true, enumerable: true, get: getter });
        return () => { Object.defineProperty(venex, field, descriptor); };
      }),
      () => {
        const descriptor = Object.getOwnPropertyDescriptor(stores, String(index))!;
        Object.defineProperty(stores, String(index), { configurable: true, enumerable: true, get: getter });
        return () => { Object.defineProperty(stores, String(index), descriptor); };
      },
    ];
    for (const mutate of mutations) {
      const restore = mutate();
      try { for (const ids of registryCases) expect(registryOutcome(preparedProductRegistryContext, ids)).toEqual(registryOutcome(oldRegistryContext, ids)); }
      finally { restore(); }
    }
    expect(getter).not.toHaveBeenCalled();
    for (const invalid of ['', 'x'.repeat(257), undefined as unknown as string])
      expect(registryOutcome(preparedProductRegistryContext, [invalid])).toEqual(registryOutcome(oldRegistryContext, [invalid]));
  });
  it('getter URL, reemplazo array y nombre mutable no se aceptan ni ejecutan getters', async () => {
    const input = row(), ready = await envelope(input), index = stores.findIndex(store => store.id === 'venex'), venex = stores[index];
    const descriptor = Object.getOwnPropertyDescriptor(venex, 'url')!, getter = vi.fn(() => descriptor.value);
    try {
      Object.defineProperty(venex, 'url', { configurable: true, enumerable: true, get: getter });
      await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY'); expect(getter).not.toHaveBeenCalled();
    } finally { Object.defineProperty(venex, 'url', descriptor); }
    try { stores[index] = { ...venex, url: 'https://other.example' }; await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY'); }
    finally { stores[index] = venex; }
    const name = venex.name;
    try { venex.name = 'Changed'; await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY'); }
    finally { venex.name = name; }
  });
  it('el contexto firmado también protege drift anterior a importar el consumer', async () => {
    const input = row(), ready = await envelope(input);
    vi.resetModules(); const fresh = await import('@/lib/scrapers/static-data'), venex = fresh.stores.find(store => store.id === 'venex')!, url = venex.url;
    try { venex.url = 'https://other.example'; const runtime = await import('./prepared-product');
      await expect(runtime.consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY');
    } finally { venex.url = url; vi.resetModules(); }
  });
  it('key de tienda, nombre y entrada array con getter fallan sin ejecutarlo', async () => {
    const input = row(), ready = await envelope(input), index = stores.findIndex(store => store.id === 'venex'), venex = stores[index];
    for (const field of ['id', 'name'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(venex, field)!, getter = vi.fn(() => descriptor.value);
      try {
        Object.defineProperty(venex, field, { configurable: true, enumerable: true, get: getter });
        await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY'); expect(getter).not.toHaveBeenCalled();
      } finally { Object.defineProperty(venex, field, descriptor); }
    }
    const descriptor = Object.getOwnPropertyDescriptor(stores, String(index))!, getter = vi.fn(() => venex);
    try {
      Object.defineProperty(stores, String(index), { configurable: true, enumerable: true, get: getter });
      await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY'); expect(getter).not.toHaveBeenCalled();
    } finally { Object.defineProperty(stores, String(index), descriptor); }
    const id = venex.id;
    try { venex.id = 'renamed-store'; await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY'); }
    finally { venex.id = id; }
    expect((await consumePreparedProduct(input, ready, options())).current.count).toBe(1);
  });
  it('unknown store normal y drift durante crypto/callback respetan contexto literal', async () => {
    const unknown = row(); unknown.product_prices![0].store_id = 'unknown-store'; unknown.product_prices![0].url = 'https://unknown.example/item';
    const record = await prepareProductRecord(unknown, policy); expect(record.registry).toEqual([['unknown-store', null, 'unknown-store']]);
    expect(json((await consumePreparedProduct(unknown, await envelope(unknown), options())).product)).toEqual(json(mapDbGuideProduct(unknown)));
    const input = row(), ready = await envelope(input), venex = stores.find(store => store.id === 'venex')!, url = venex.url;
    const verify = crypto.subtle.verify.bind(crypto.subtle);
    try {
      vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => { const result = await verify(...args); venex.url = 'https://other.example'; return result; });
      await expect(consumePreparedProduct(input, ready, options())).rejects.toThrow('REGISTRY'); vi.restoreAllMocks(); venex.url = url;
      await expect(consumePreparedProduct(input, ready, { ...options(), now: () => { venex.url = 'https://other.example'; return now; } })).rejects.toThrow('REGISTRY');
    } finally { venex.url = url; }
  });
  it('el entry runtime no carga mapper/productor, Next, Supabase ni private signing', async () => {
    const result = await build({ stdin: { contents: "export {consumePreparedProduct,importPreparedProductPublicKey} from './src/lib/catalog/prepared-product';", resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', metafile: true });
    expect(Object.keys(result.metafile!.inputs).filter(path => /product-read-mapper|prepared-product-builder|node_modules\/(next|@supabase)|server-only/.test(path))).toEqual([]);
    expect(result.outputFiles[0].text).not.toContain('subtle.sign(');
  });
});
