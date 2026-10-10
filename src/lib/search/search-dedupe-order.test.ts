import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isComparableStoreOffer } from '@/lib/price-utils';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { normalizeIdentityText } from '@/lib/product-identity';
import type { Product } from '@/lib/types';
import { dedupeCpuSearchProducts } from './search-dedupe';

const observedAt = '2026-10-10T20:00:00Z';
function cpu(id: string, name: string, price: number, storeId: string, reviewed = true): Product {
  const date = new Date(observedAt);
  const url = `https://${storeId}.com.ar/producto/procesador-amd-ryzen-7-5700x/`;
  const sourceIdentity = { title: name, listingRef: `${storeId}:url:${url}` };
  return { id, name, model: name, category: 'procesadores', brand: 'AMD', specs: {},
    createdAt: date, updatedAt: date, lowestPrice: price, highestPrice: price, averagePrice: price,
    prices: [{ storeId, storeName: storeId, url, price, stock: 'in-stock', installment: null,
      priceCondition: 'special', lastUpdated: date, sourceIdentity,
      ...(reviewed ? { identityReview: { version: 1 as const, status: 'consistent' as const,
        reason: 'consistent-text' as const, reviewedAt: observedAt, model: 'jev-test', confidence: .95,
        subject: { name: normalizeIdentityText(name), category: 'procesadores', url }, sourceIdentity } } : {}) }] };
}

function offerSubjects(rows: Product[]): string[] {
  return [...new Set(rows.flatMap(product => product.prices
    .filter(offer => isComparableStoreOffer(offer, product) && isCatalogOfferFresh(offer.lastUpdated))
    .map(offer => JSON.stringify([offer.storeId, offer.url, offer.price, offer.priceCondition ?? null,
      offer.identityReview ?? null, offer.sourceIdentity ?? null]))))].sort();
}

function aliases(reviewed = true): Product[] {
  return [cpu('agrupado-procesadores-5700x', 'AMD Ryzen 7 5700X', 100000, 'katech', reviewed),
    cpu('alias-am4', 'Procesador AMD Ryzen 7 5700X AM4', 200000, 'maxtecno', reviewed),
    cpu('alias-turbo', 'Micro AMD Ryzen 7 5700X 4.6GHz AM4', 300000, 'goldentechstore', reviewed)];
}
const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(observedAt)); });
afterEach(() => vi.useRealTimers());

describe('fusión CPU conserva ofertas y orden de páginas ya admitidas', () => {
  it.each(orders)('conserva tres sujetos válidos aunque el mínimo sobreviva, orden %s,%s,%s', (...order) => {
    const rows = aliases(), input = order.map(index => rows[index]);
    const snapshot = JSON.stringify(input), before = offerSubjects(input);
    expect(before).toHaveLength(3);
    const result = dedupeCpuSearchProducts(input);
    expect(result).toEqual(input);
    expect(offerSubjects(result)).toEqual(before);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it.each([false, true])('rechaza habilitar una oferta antes inválida sin cambiar el mínimo, reviewed=%s', reviewed => {
    const [canonical, alias] = aliases(reviewed);
    // El precio 250k tiene dictamen para el sujeto canónico pero estaba bajo
    // otro título: no era elegible antes de fusionar esas filas.
    const hidden = cpu('hidden', canonical.name, 250000, 'goldentechstore').prices[0];
    alias.prices.push(hidden);
    const before = offerSubjects([canonical, alias]);
    expect(before).toHaveLength(2);
    const result = dedupeCpuSearchProducts([canonical, alias]);
    expect(result).toEqual([canonical, alias]);
    expect(offerSubjects(result)).toEqual(before);
  });

  it('no pierde precio ni condición distintos del mismo destino y sujeto', () => {
    const [canonical] = aliases(false);
    const alias = { ...canonical, id: 'same-subject', prices: canonical.prices.map(offer => ({
      ...offer, priceCondition: 'unspecified' as const,
    })) };
    expect(offerSubjects([canonical, alias])).toHaveLength(2);
    expect(dedupeCpuSearchProducts([canonical, alias])).toEqual([canonical, alias]);
    const changedPrice = { ...alias, lowestPrice: 150000, prices: alias.prices.map(offer => ({
      ...offer, price: 150000, priceCondition: 'special' as const,
    })) };
    expect(dedupeCpuSearchProducts([canonical, changedPrice])).toEqual([canonical, changedPrice]);
  });

  it.each(orders)('fusiona aliases sin dictamen sin inventar evidencia, orden %s,%s,%s', (...order) => {
    const rows = aliases(false), input = order.map(index => rows[index]);
    const before = offerSubjects(input), snapshot = JSON.stringify(input);
    const result = dedupeCpuSearchProducts(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('agrupado-procesadores-5700x');
    expect(offerSubjects(result)).toEqual(before);
    expect(result[0].prices.every(offer => !offer.identityReview)).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('no convierte referencias viejas, stock desconocido o review pendiente en oferta actual', () => {
    const [canonical, alias] = aliases(false);
    const stale = cpu('stale', canonical.name, 80000, 'goldentechstore', false).prices[0];
    stale.lastUpdated = new Date('2026-10-08T20:00:00Z');
    const unknown = { ...stale, url: `${stale.url}?observation=unknown`,
      lastUpdated: new Date(observedAt), stock: 'unknown' as const };
    const pending = cpu('pending', canonical.name, 90000, 'goldentechstore').prices[0];
    pending.identityReview = { ...pending.identityReview!, status: 'needs-review', reason: 'provider-unavailable' };
    const sourceChanged = cpu('source-changed', canonical.name, 95000, 'goldentechstore').prices[0];
    sourceChanged.sourceIdentity = { ...sourceChanged.sourceIdentity!, storeSku: 'changed-sku' };
    alias.prices.push(stale, unknown, pending, sourceChanged);
    const before = offerSubjects([canonical, alias]);
    expect(before).toHaveLength(2);
    const result = dedupeCpuSearchProducts([canonical, alias]);
    expect(result).toHaveLength(1);
    expect(offerSubjects(result)).toEqual(before);
    expect(result[0].prices).toContain(stale);
    expect(result[0].prices).toContain(unknown);
    expect(result[0].prices).toContain(pending);
    expect(result[0].prices).toContain(sourceChanged);
  });

  it('elige título e ID deterministas y ocupa la primera posición original del grupo', () => {
    const [canonical, short, rich] = aliases(false);
    canonical.id = 'noncanonical';
    const other = { ...canonical, id: 'mouse', category: 'perifericos' as const, name: 'Mouse Logitech G502' };
    const first = dedupeCpuSearchProducts([short, other, rich]);
    const second = dedupeCpuSearchProducts([rich, other, short]);
    expect(first.map(product => product.id)).toEqual(['alias-turbo', 'mouse']);
    expect(second.map(product => product.id)).toEqual(['alias-turbo', 'mouse']);
    expect(first[1]).toBe(other);
    // Canonical gana aun con título más corto, sin mover el grupo tras el mouse.
    canonical.id = 'agrupado-procesadores-5700x';
    expect(dedupeCpuSearchProducts([short, other, canonical]).map(product => product.id))
      .toEqual(['agrupado-procesadores-5700x', 'mouse']);
    const sameTitle = { ...short, id: 'a-alias' };
    expect(dedupeCpuSearchProducts([short, sameTitle])[0].id).toBe('a-alias');
    expect(dedupeCpuSearchProducts([sameTitle, short])[0].id).toBe('a-alias');
  });

  it('conserva posición y referencias de productos ajenos a CPU', () => {
    const [canonical, alias] = aliases(false);
    const mouse = { ...canonical, id: 'mouse', category: 'perifericos' as const, name: 'Mouse Logitech G502' };
    const ram = { ...canonical, id: 'ram', category: 'memoria-ram' as const, name: 'DDR5 32GB' };
    const result = dedupeCpuSearchProducts([mouse, alias, ram, canonical]);
    expect(result.map(product => product.id)).toEqual(['mouse', canonical.id, 'ram']);
    expect(result[0]).toBe(mouse);
    expect(result[2]).toBe(ram);
  });

  it('mantiene el guard de rango mínimo y máximo incluso para una fusión segura', () => {
    const rows = aliases(false);
    expect(dedupeCpuSearchProducts(rows, { minPrice: 150000 })).toHaveLength(3);
    expect(dedupeCpuSearchProducts(rows, { maxPrice: 90000 })).toHaveLength(3);
    expect(dedupeCpuSearchProducts(rows, { minPrice: 100000, maxPrice: 100000 })).toHaveLength(1);
  });
});
