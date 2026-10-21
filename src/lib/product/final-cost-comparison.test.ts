import { describe, expect, it } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { compareFinalCosts, finalCostOfferKey, parseShippingCents } from './final-cost-comparison';
import { CATALOG_OFFER_FRESH_MS } from '@/lib/price-freshness';

const now = Date.parse('2026-10-21T18:00:00Z');
const product = { name: 'AMD Ryzen 7 7800X3D', category: 'procesadores' } as Product;
function offer(storeId: string, price: number, overrides: Partial<ProductPrice> = {}): ProductPrice {
  return { storeId, storeName: storeId, url: `https://store.example/amd-ryzen-7-7800x3d`,
    price, stock: 'in-stock', installment: null, lastUpdated: new Date(now), ...overrides };
}

describe('costo con envío ingresado', () => {
  it.each(['', '-1', '1.000,50', '3,456', 'NaN', 'Infinity', '1e3', '0x10', '9007199254740991'])('no confunde %j con un importe confirmado', value => {
    expect(parseShippingCents(value)).toBeNull();
  });
  it('admite cero explícito y decimales sin perder centavos', () => {
    expect(parseShippingCents('0')).toBe(0);
    expect(parseShippingCents(' 4500,50 ')).toBe(450050);
    expect(parseShippingCents('12.01')).toBe(1201);
  });
  it('el envío puede invertir el orden sin modificar los precios observados', () => {
    const a = offer('a', 100000), b = offer('b', 105000), c = offer('c', 110000);
    const shipping = { [finalCostOfferKey(a)]: '6000', [finalCostOfferKey(b)]: '0' };
    const result = compareFinalCosts(product, [a, b, c], shipping, now);
    expect(result.winners.map(row => row.offer.storeId)).toEqual(['b']);
    expect(result.winners[0].totalCents).toBe(10500000);
    expect(result.pending).toBe(1);
    expect(result.rows[2].totalCents).toBeNull();
    expect(a.price).toBe(100000);
  });
  it('no proclama un ganador con una sola cotización de envío', () => {
    const a = offer('a', 100000), b = offer('b', 105000);
    expect(compareFinalCosts(product, [a, b], { [finalCostOfferKey(a)]: '0' }, now).winners).toEqual([]);
  });
  it('conserva el empate y centavos en los totales', () => {
    const a = offer('a', 100000.01), b = offer('b', 100000.02);
    const result = compareFinalCosts(product, [a, b], { [finalCostOfferKey(a)]: '0,02', [finalCostOfferKey(b)]: '0,01' }, now);
    expect(result.winners).toHaveLength(2);
    expect(result.winners[0].totalCents).toBe(10000003);
  });
  it.each([
    { stock: 'unknown' as const }, { stock: 'out-of-stock' as const },
    { lastUpdated: new Date(now - CATALOG_OFFER_FRESH_MS - 1) },
    { lastUpdated: new Date(now + 120000) },
    { url: 'https://store.example/amd-ryzen-7-7700x' },
  ])('no rescata una oferta inelegible por tener envío cargado: %j', overrides => {
    const a = offer('a', 100000, overrides), b = offer('b', 105000);
    const result = compareFinalCosts(product, [a, b], { [finalCostOfferKey(a)]: '0', [finalCostOfferKey(b)]: '0' }, now);
    expect(result.rows.map(row => row.offer.storeId)).toEqual(['b']);
    expect(result.winners).toEqual([]);
  });
  it('no traslada el envío cuando cambia la observación o su medio de pago', () => {
    const a = offer('a', 100000);
    const shipping = { [finalCostOfferKey(a)]: '0' };
    for (const changed of [{ price: 100001 }, { lastUpdated: new Date(now - 1000) }, { priceCondition: 'special' as const }]) {
      expect(compareFinalCosts(product, [{ ...a, ...changed }], shipping, now).rows[0].totalCents).toBeNull();
    }
  });
});
