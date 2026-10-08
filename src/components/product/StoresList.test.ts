import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { CATALOG_OFFER_FRESH_MS } from '@/lib/price-freshness';
import { StoresList } from './StoresList';

const now = Date.parse('2026-10-08T15:00:00Z');

function product(): Product {
  return {
    id: 'cpu-7800x3d', name: 'AMD Ryzen 7 7800X3D', category: 'procesadores', brand: 'AMD', model: 'Ryzen 7 7800X3D',
    specs: {}, prices: [], lowestPrice: 80_000, highestPrice: 120_000, averagePrice: 100_000,
    createdAt: new Date('2026-09-20T00:00:00.000Z'), updatedAt: new Date('2026-09-21T00:00:00.000Z'),
  };
}

function offer(overrides: Partial<ProductPrice> = {}): ProductPrice {
  return {
    storeId: 'venex', storeName: 'Venex', url: 'https://www.venex.com.ar/amd-ryzen-7-7800x3d', price: 80_000,
    stock: 'in-stock', installment: null, lastUpdated: new Date(now - 60_000), ...overrides,
  };
}

describe('filas compactas de ofertas', () => {
  it('muestra tienda, precio, stock y fecha en una fila semántica sin avisos plegados innecesarios', () => {
    const $ = load(renderToStaticMarkup(createElement(StoresList, { product: product(), merchantPrices: [offer()], now })));
    const row = $('li[data-store-id="venex"]');
    expect(row).toHaveLength(1);
    expect(row.text()).toContain('@Venex');
    expect(row.text()).toContain('Stock informado en las últimas 24 h');
    expect(row.find('p:contains("Precio relevado:") time').attr('datetime')).toBe(new Date(now - 60_000).toISOString());
    expect(row.find('details')).toHaveLength(0);
    expect(row.find('a[href^="/contacto"]')).toHaveLength(1);
  });

  it('mantiene visibles los avisos que cambian la vigencia o la comparabilidad', () => {
    const stale = offer({ storeId: 'mexx', storeName: 'Mexx', url: 'https://www.mexx.com.ar/producto/7800x3d',
      lastUpdated: new Date(now - CATALOG_OFFER_FRESH_MS - 1), priceCondition: 'special', stock: 'unknown' });
    const $ = load(renderToStaticMarkup(createElement(StoresList, { product: product(), merchantPrices: [stale], now })));
    const row = $('li[data-store-id="mexx"]');
    const visible = row.clone();
    visible.find('details').remove();
    expect(visible.text()).toContain('PRECIO ANTERIOR · PENDIENTE DE ACTUALIZAR');
    expect(visible.text()).toContain('Precio especial: verificá el medio de pago.');
    expect(visible.text()).toContain('Stock sin confirmar.');
  });

  it('pliega solo la aclaración de otra publicación de la misma tienda', () => {
    const recent = offer();
    const duplicate = offer({ url: 'https://www.venex.com.ar/amd-ryzen-7-7800x3d-tray', price: 85_000 });
    const $ = load(renderToStaticMarkup(createElement(StoresList, { product: product(), merchantPrices: [recent, duplicate], now })));
    const details = $('[data-testid="reference-offers"] li[data-store-id="venex"] details');
    expect(details).toHaveLength(1);
    expect(details.find('summary').text()).toBe('Ver avisos (1)');
    expect(details.text()).toContain('Otra publicación de la misma tienda');
    expect($('details details')).toHaveLength(1);
    expect($.text().match(/Precio relevado:/g)).toHaveLength(2);
  });
});
