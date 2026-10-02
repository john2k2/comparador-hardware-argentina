import { readFile, writeFile } from 'node:fs/promises';
import { discoverWooPublicListings } from '../../src/lib/scrapers/source-discovery';
import { sourceContract } from '../../src/lib/scrapers/source-contracts';
import { fetchWooCommerceKnownOffer } from '../../src/lib/scrapers/woocommerce-shared';
import { resolveHardwareCategoryForProduct } from '../../src/lib/catalog/hardware-categories';
import { hasExplicitIdentityConflict } from '../../src/lib/quality/offer-identity';
import { proveOfferAttributes } from '../../src/lib/quality/offer-attribute-proof';
import { SourceHttpError, sourceHttpMetrics } from '../../src/lib/scrapers/source-http';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('SOURCE_AUDIT_PATHS_REQUIRED');
const targets: unknown = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(targets) || targets.length < 1 || targets.length > 24) throw new Error('SOURCE_INVALID_DISCOVERY_TARGET');
const results = [];
// Diagnóstico manual explícito: no importa precios, no escribe DB ni despacha cola.
for (const raw of targets) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('SOURCE_INVALID_DISCOVERY_TARGET');
  const item = raw as Record<string, unknown>;
  if (typeof item.storeId !== 'string' || !sourceContract(item.storeId)?.publicProductsApi
    || typeof item.sourceId !== 'string' || !/^[1-9]\d{0,14}$/.test(item.sourceId)
    || typeof item.expectedName !== 'string' || !item.expectedName || item.expectedName.length > 400)
    throw new Error('SOURCE_INVALID_DISCOVERY_TARGET');
  const target = { storeId: item.storeId, sourceId: item.sourceId, expectedName: item.expectedName };
  const signal = AbortSignal.timeout(40_000);
  try {
    const listings = await discoverWooPublicListings(target.storeId, { sourceIds: [target.sourceId], signal });
    const listing = listings.find(item => item.sourceId === target.sourceId);
    if (!listing) { results.push({ ...target, status: 'no-validated-listing' }); continue; }
    const category = resolveHardwareCategoryForProduct(target.expectedName);
    const detail = await fetchWooCommerceKnownOffer(target.storeId, listing.url, category, signal);
    const price = detail?.prices[0];
    results.push({ ...target, listing, checkedAt: new Date().toISOString(), status: detail ? 'detail-observed' : 'detail-not-verified',
      ...(detail && price ? { observedTitle: detail.name, observedSku: detail.specs.SKU ?? null,
        url: price.url, price: price.price, stock: price.stock, observedAt: new Date(price.lastUpdated).toISOString(),
        priceCondition: price.priceCondition ?? 'unspecified',
        explicitConflict: hasExplicitIdentityConflict({ name: target.expectedName, category, offerText: detail.name }),
        proof: proveOfferAttributes(target.expectedName, category, detail.name) } : {}) });
  } catch (error) {
    results.push({ ...target, checkedAt: new Date().toISOString(), status: 'not-verified',
      reason: error instanceof SourceHttpError ? error.reason : 'network-or-invalid-response',
      httpStatus: error instanceof SourceHttpError ? error.status : undefined });
  }
}
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, pricesImported: false, results, http: sourceHttpMetrics() }, null, 2));
