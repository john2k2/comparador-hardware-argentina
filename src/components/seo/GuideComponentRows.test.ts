import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuideComponentRows } from './GuideComponentRows';
import { GUIDE_SLOT_KEYS, type GuideSlotKey } from '@/lib/seo/budget-builder';
import type { GuideStoreOffer, ResolvedGuideComponent } from '@/lib/seo/budget-guide-pricing';

describe('condición de pago de la guía', () => {
  it.each([
    ['compragamer', 'special', 'Precio especial por depósito o transferencia.'],
    ['mexx', 'special', 'Precio especial: verificá el medio de pago.'],
    ['compragamer', 'unspecified', null],
    ['compragamer', undefined, null],
  ] as const)('muestra sólo la condición acreditada para %s / %s', (storeId, priceCondition, label) => {
    const offer: GuideStoreOffer = { storeId, storeName: storeId, price: 100_000, stock: 'in-stock',
      url: 'https://example.com/producto', priceCondition, lastUpdated: '2026-10-14T04:24:40.261Z' };
    const component: ResolvedGuideComponent = { name: 'CPU', description: '', price: offer.price,
      priceSource: 'catalog', bestStoreName: storeId, bestStoreUrl: offer.url, storeCount: 1, storeNames: [storeId], offers: [offer] };
    const missing = { ...component, priceSource: 'estimate' as const, offers: [] };
    const slots = Object.fromEntries(GUIDE_SLOT_KEYS.map(key => [key, key === 'cpu' ? component : missing])) as Record<GuideSlotKey, ResolvedGuideComponent>;
    const markup = renderToStaticMarkup(createElement(GuideComponentRows, { slots, buyableOnly: true }));
    if (label) expect(markup).toContain(label);
    else expect(markup).not.toContain('Precio especial');
    if (storeId !== 'compragamer') expect(markup).not.toContain('depósito o transferencia');
  });
});
