import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextPriorityTargets, planSampleTargets, type PriorityGroup } from './priority-planning';
import type { Product } from '@/lib/types';
import type { RefreshTarget } from './on-demand/contracts';

const first: RefreshTarget = { productId: 'cpu', storeId: 'mexx', url: 'https://www.mexx.com.ar/cpu-1' };
const second: RefreshTarget = { ...first, storeId: 'venex', url: 'https://www.venex.com.ar/cpu-1' };
const key = (target: RefreshTarget) => JSON.stringify([target.productId, target.storeId, target.url]);
afterEach(() => vi.useRealTimers());

describe('plan prioritario de ofertas conocidas', () => {
  it('comparte una oferta entre guías y no vuelve a comprobar grupos cubiertos', () => {
    const groups: PriorityGroup[] = [{ key: '1M/cpu', targets: [first], covered: false },
      { key: '2M/cpu', targets: [first], covered: false }, { key: '3M/cpu', targets: [second], covered: true }];
    expect(nextPriorityTargets(groups, new Set(), [])).toEqual([first]);
  });
  it('usa la siguiente tienda cuando una observación no resulta comparable', () => {
    const groups = [{ key: '2M/cpu', targets: [first, second], covered: false }];
    const result = { ...first, state: 'updated' as const, comparable: false, observedAt: new Date().toISOString() };
    expect(nextPriorityTargets(groups, new Set([key(first)]), [result])).toEqual([second]);
    expect(nextPriorityTargets(groups, new Set([key(first), key(second)]), [result])).toEqual([]);
    expect(nextPriorityTargets(groups, new Set([key(first)]), [{ ...result, comparable: true }])).toEqual([]);
  });
  it('no toma un resultado vencido como pieza cubierta', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
    expect(nextPriorityTargets([{ key: 'cpu', targets: [first, second], covered: false }], new Set([key(first)]), [
      { ...first, state: 'updated', comparable: true, observedAt: '2026-09-29T08:00:00Z' },
    ])).toEqual([second]);
  });
  it('renueva la muestra por fecha de cada oferta y conserva los fallos de identidad', () => {
    const now = Date.parse('2026-09-29T12:00:00Z');
    const product = { id: 'cpu', name: 'Ryzen 5 5600', category: 'procesadores', prices: [
      { ...first, lastUpdated: new Date(now - 2 * 3600_000) },
      { ...first, lastUpdated: new Date(now - 2 * 3600_000) },
      { ...second, lastUpdated: new Date(now - 1000) },
      { storeId: 'unknown', url: 'http://insecure.test/cpu', lastUpdated: new Date(0) },
    ] } as unknown as Product;
    expect(planSampleTargets([product], now)).toEqual([first, second]);
    product.prices[2].identityReview = { version: 1, status: 'consistent', reason: 'consistent-text',
      reviewedAt: new Date(now).toISOString(), model: 'jev-1.13.0', confidence: 0.95,
      sourceIdentity: { title: product.name, listingRef: 'venex:cpu-1' },
      subject: { name: 'ryzen 5 5600', category: product.category, url: second.url } };
    expect(planSampleTargets([product], now)).toEqual([first]);
    product.prices[2].identityReview = { version: 1, status: 'needs-review', reason: 'provider-unavailable',
      reviewedAt: null, model: null, confidence: null, subject: { name: product.name, category: product.category, url: second.url } };
    expect(planSampleTargets([product], now)).toEqual([first, second]);
  });
});
