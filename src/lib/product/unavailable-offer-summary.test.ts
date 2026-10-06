import { describe, expect, it } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { describeUnavailableOffers } from './unavailable-offer-summary';

const now = new Date('2026-10-05T13:00:00Z').getTime();
const product = { name: 'Mouse Corsair M75 Blanco', category: 'perifericos' } as Product;
function offer(overrides: Partial<ProductPrice> = {}): ProductPrice {
  return { storeId: 'test-store', storeName: 'Tienda', url: 'https://store.example/mouse-corsair-m75-blanco',
    price: 229_990, stock: 'in-stock', installment: null, lastUpdated: new Date('2026-10-03T23:20:00Z'), ...overrides };
}
describe('unavailable offer explanation', () => {
  it('explains the old prices using their observation, without guessing an identity problem', () => {
    const result = describeUnavailableOffers(product, [offer()], now);
    expect(result.heading).toBe('PRECIOS PENDIENTES DE ACTUALIZAR');
    expect(result.latestObservedAt?.toISOString()).toBe('2026-10-03T23:20:00.000Z');
    expect(result.reasons.join(' ')).toContain('más de 24 horas');
    expect(result.reasons.join(' ')).not.toContain('variante');
  });
  it('explains a conflicting recent variant independently of age', () => {
    const result = describeUnavailableOffers(product, [offer({ lastUpdated: new Date(now), url: 'https://store.example/mouse-corsair-m75-negro' })], now);
    expect(result.heading).toBe('SIN OFERTAS APTAS PARA COMPARAR');
    expect(result.reasons.join(' ')).toContain('variante');
    expect(result.reasons.join(' ')).not.toContain('más de 24 horas');
  });
  it('does not call missing offers or unknown stock sold out', () => {
    expect(describeUnavailableOffers(product, [], now).reasons.join(' ')).toContain('no confirma');
    const unknown = describeUnavailableOffers(product, [offer({ lastUpdated: new Date(now), stock: 'unknown' })], now);
    expect(unknown.reasons.join(' ')).toContain('disponibilidad');
    expect(unknown.reasons.join(' ')).toContain('no confirma');
  });
  it('does not describe invalid or future dates as observations more than 24 hours old', () => {
    for (const lastUpdated of [new Date(0), new Date(NaN), new Date(now + 120_000)]) {
      const result = describeUnavailableOffers(product, [offer({ lastUpdated })], now);
      expect(result.latestObservedAt).toBeNull();
      expect(result.reasons.join(' ')).toContain('fecha de precio válida');
    }
  });
});
