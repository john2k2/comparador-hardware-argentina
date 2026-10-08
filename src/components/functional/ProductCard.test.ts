import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { ProductCard } from './ProductCard';

const observedAt = new Date('2026-10-08T12:00:00.000Z');

function product(): Product {
  return {
    id: 'cpu-7', name: 'AMD Ryzen 7 7800X3D', category: 'procesadores', model: '7800X3D', brand: 'AMD', specs: {},
    lowestPrice: 100_000, highestPrice: 100_000, averagePrice: 100_000, createdAt: observedAt, updatedAt: observedAt,
    prices: [{ storeId: 'mexx', storeName: 'Mexx', url: 'https://www.mexx.com.ar/producto/7800x3d', stock: 'in-stock',
      price: 100_000, lastUpdated: observedAt, installment: null }],
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('tarjeta de producto', () => {
  it('renderiza en servidor la misma antigüedad sin importar el minuto del reloj', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(observedAt.getTime() + 2 * 3_600_000));
    const early = renderToStaticMarkup(createElement(ProductCard, { product: product() }));
    vi.setSystemTime(new Date(observedAt.getTime() + 5 * 3_600_000));
    const later = renderToStaticMarkup(createElement(ProductCard, { product: product() }));
    expect(early).toBe(later);
    expect(early).not.toMatch(/HACE \d+ H/);
    expect(early).toContain('RELEVADO EN LAS ÚLTIMAS 24 H');
  });

  it('prioriza el precio y resume tienda y fecha en una línea', () => {
    const $ = load(renderToStaticMarkup(createElement(ProductCard, { product: product() })));
    const meta = $('p:has(time)');
    expect(meta.text()).toContain('@Mexx');
    expect(meta.find('time').attr('datetime')).toBe(observedAt.toISOString());
    expect($('.tabular-nums').text()).toContain('100.000');
    expect($('[class*="min-h-[3"]')).toHaveLength(0);
  });
});
