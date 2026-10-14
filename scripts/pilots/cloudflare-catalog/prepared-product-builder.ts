// Productor de Mac/controlplane. Nunca importar este archivo desde el Worker.
import { mapDbGuideProduct } from '../../../src/lib/persistence/product-read-mapper';
import { needsIdentityReview } from '../../../src/lib/quality/offer-identity';
import { isComparableStoreOffer } from '../../../src/lib/price-utils';
import { toNumber } from '../../../src/lib/persistence/product-read-helpers';
import { createUnsignedPreparedProduct, preparedPriceCodec, preparedProductCodec, preparedProductHash, preparedProductInput,
  preparedProductPatch, PREPARED_PRODUCT_MAX_OFFERS, type PreparedProductRecord, type UnsignedPreparedProduct } from '../../../src/lib/catalog/prepared-product';
import { preparedProductRegistryContext, assertPreparedProductRegistry } from '../../../src/lib/catalog/prepared-product';
import type { DbProductRow } from '../../../src/lib/persistence/product-read-types';

export async function prepareProductRecord(inputRow: DbProductRow, policy: string): Promise<PreparedProductRecord> {
  preparedProductInput(inputRow); // validar antes de copiar sin ejecutar getters.
  const row = JSON.parse(JSON.stringify(inputRow)) as DbProductRow;
  const input = preparedProductInput(row), raw = row.product_prices ?? [];
  if (raw.length > PREPARED_PRODUCT_MAX_OFFERS) throw new Error('PREPARED_PRODUCT_OFFERS');
  const registry = preparedProductRegistryContext(raw.map(price => price.store_id));
  const mapped = mapDbGuideProduct(row), subject = { name: mapped.name, category: mapped.category, specs: mapped.specs };
  const product = JSON.parse(JSON.stringify({ ...mapped, prices: [], lowestPrice: 0, highestPrice: 0, averagePrice: 0 })) as Record<string, unknown>;
  let index = 0;
  // QC completa sin awaits: ninguna mutación transitoria de registry puede colarse.
  const reviewedOffers = raw.map(price => {
    const output = price.store_id && toNumber(price.price, 0) > 0 ? mapped.prices[index++] : null;
    if (output === undefined) throw new Error('PREPARED_PRODUCT_OFFER_ALIGNMENT');
    return { output: output
      ? preparedProductPatch(preparedPriceCodec(price), JSON.parse(JSON.stringify(output)) as Record<string, unknown>, 'price') : null,
    reviewAllowed: output ? !needsIdentityReview(output, subject) : false,
    // Precio/stock se evalúan luego en runtime; identidad permanece ligada al sujeto.
    identityAllowed: output ? isComparableStoreOffer({ ...output, price: 1, stock: 'in-stock' }, subject) : false };
  });
  if (index !== mapped.prices.length) throw new Error('PREPARED_PRODUCT_OFFER_ALIGNMENT');
  const offers = await Promise.all(reviewedOffers.map(async (offer, i) => ({ inputHash: await preparedProductHash(raw[i]), ...offer })));
  const inputHash = await preparedProductHash(input); assertPreparedProductRegistry(registry);
  return { version: 2, policy, inputHash, registry, product: preparedProductPatch(preparedProductCodec(row), product, 'product'), offers };
}

export async function prepareUnsignedProduct(row: DbProductRow, policy: string): Promise<UnsignedPreparedProduct> {
  return createUnsignedPreparedProduct(row.id, await prepareProductRecord(row, policy));
}
