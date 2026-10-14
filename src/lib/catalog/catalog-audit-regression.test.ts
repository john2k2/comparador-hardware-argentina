import { describe, expect, it } from 'vitest';
import fixture from './catalog-audit-regression.fixture.json';
import { inferDetailHardwareCategory, inferHardwareCategoryFromName, resolveHardwareCategoryForProduct } from './hardware-categories';
import { buildProductIdentityKey, buildProductVariantKey, extractExactModelIdentity } from '@/lib/product-identity';
import { guardCategoryPage } from '@/lib/search/category-page-guard';
import { dedupeProductsByCanonicalName } from '@/lib/persistence/product-read-grouping';
import { groupSearchProducts } from '@/lib/search/search-dedupe';
import type { Product } from '@/lib/types';

function row(id: string): Product {
  const value = fixture.products.find(product => product.id === id)!;
  return {
    ...value,
    createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt),
    prices: value.prices.map(offer => ({ ...offer, lastUpdated: new Date(offer.lastUpdated) })),
  } as Product;
}

const categoryMistakes = [
  ['maxtecno-api-879981', 'almacenamiento'],
  ['maxtecno-api-901942', 'motherboards'],
  ['maxtecno-api-899125', 'perifericos'],
  ['dinobyte-api-3812429', 'perifericos'],
  ['dinobyte-api-3813055', 'almacenamiento'],
] as const;
const collidedPairs = [
  ['dinobyte-api-2805048', 'dinobyte-api-2903292'],
  ['cg-21831', 'cg-21832'],
  ['cg-22251', 'cg-22252'],
  ['cg-21882', 'cg-20207'],
] as const;

describe('filas reales del corte de catálogo 13/10/2026', () => {
  it.each(categoryMistakes)('corrige la categoría de %s conservando las ofertas observadas', (id, expected) => {
    const product = row(id);
    const before = structuredClone(product);
    expect(inferHardwareCategoryFromName(product.name)).toBe(expected);
    expect(inferDetailHardwareCategory(product.name)).toBe(expected);
    expect(resolveHardwareCategoryForProduct(product.name, product.category)).toBe(expected);
    expect(guardCategoryPage([product], product.category)).toEqual({ products: [], excluded: 1 });
    expect(guardCategoryPage([product]).products).toEqual([{ ...product, category: expected }]);
    expect(product).toEqual(before);
  });

  it.each(collidedPairs)('separa identidad y variante de %s frente a %s, incluso con título reducido', (firstId, secondId) => {
    const first = row(firstId), second = row(secondId);
    // El corte acredita una colisión persistida; no acredita fusión de ofertas.
    expect(first.canonicalProductKey).toBe(second.canonicalProductKey);
    const key = (product: Product) => buildProductIdentityKey(product.category, product.normalizedTitle!, product.name);
    const variant = (product: Product) => buildProductVariantKey(product.category, product.normalizedTitle!, product.name);
    expect(key(first)).not.toBe(key(second));
    expect(variant(first)).not.toBe(variant(second));
    expect(extractExactModelIdentity(first.category, first.name)).not.toBe(extractExactModelIdentity(second.category, second.name));
    expect(key(first)).toBe(buildProductIdentityKey(first.category, first.name));
  });

  it.each(collidedPairs)('conserva separadas filas con clave antigua %s/%s al leer y agrupar', (firstId, secondId) => {
    const products = [row(firstId), row(secondId)];
    const before = structuredClone(products);
    const read = dedupeProductsByCanonicalName(products);
    expect(read).toHaveLength(2);
    expect(read.map(product => product.id)).toEqual(products.map(product => product.id));
    expect(read.map(product => product.prices)).toEqual(products.map(product => product.prices));
    const grouped = groupSearchProducts(products, new Map(products.map(product => [product.name, product.normalizedTitle!])), [], '');
    expect(grouped).toHaveLength(2);
    expect(new Set(grouped.map(product => product.canonicalProductKey)).size).toBe(2);
    expect(products).toEqual(before);
  });
});
