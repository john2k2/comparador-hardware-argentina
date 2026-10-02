import { writeFile } from 'node:fs/promises';
import { stores } from '../../src/lib/scrapers/static-data';
import { sourceContract } from '../../src/lib/scrapers/source-contracts';
import { discoverWooPublicListings } from '../../src/lib/scrapers/source-discovery';
import { SourceHttpError, sourceHttpMetrics } from '../../src/lib/scrapers/source-http';

const [output] = process.argv.slice(2);
if (!output) throw new Error('SOURCE_AUDIT_OUTPUT_REQUIRED');
const results = [];
// Una muestra pública por tienda WooCommerce. Las otras plataformas quedan explícitas.
for (const store of stores) {
  const contract = sourceContract(store.id)!;
  if (!contract.publicProductsApi) { results.push({ ...contract, status: 'api-not-verified', sampledListings: [] }); continue; }
  try {
    const listings = await discoverWooPublicListings(store.id, { signal: AbortSignal.timeout(20_000) });
    results.push({ ...contract, checkedAt: new Date().toISOString(), status: listings.length ? 'public-api-readable' : 'no-validated-listing', sampledListings: listings });
  } catch (error) {
    results.push({ ...contract, checkedAt: new Date().toISOString(), status: 'not-verified',
      reason: error instanceof SourceHttpError ? error.reason : 'network-or-invalid-response',
      httpStatus: error instanceof SourceHttpError ? error.status : undefined, sampledListings: [] });
  }
}
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, pricesAccepted: false, results, http: sourceHttpMetrics() }, null, 2));
