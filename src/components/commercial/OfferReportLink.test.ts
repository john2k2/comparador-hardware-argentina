import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { OfferReportLink } from './OfferReportLink';
import { ProductCard } from '@/components/functional/ProductCard';
import { StoresList } from '@/components/product/StoresList';
import { GuideComponentRows } from '@/components/seo/GuideComponentRows';
import { GUIDE_SLOT_KEYS } from '@/lib/seo/budget-builder';
import type { GuideSlotKey } from '@/lib/seo/budget-builder';
import type { ResolvedGuideComponent } from '@/lib/seo/budget-guide-pricing';
import type { Product } from '@/lib/types';

const product: Product = {
  id: 'cpu-7', name: 'AMD Ryzen 7 7800X3D', category: 'procesadores', model: '7800X3D', brand: 'AMD', specs: {},
  lowestPrice: 1, highestPrice: 1, averagePrice: 1, createdAt: new Date(), updatedAt: new Date(),
  prices: [{ storeId: 'mexx', storeName: 'Mexx', url: 'https://www.mexx.com.ar/producto/7800x3d', stock: 'in-stock',
    price: 100_000, lastUpdated: new Date(), installment: null }],
};

describe('acción independiente de reporte', () => {
  it('reporta al contacto sin confundirlo con un enlace de tienda', () => {
    const $ = load(renderToStaticMarkup(createElement(OfferReportLink, { context: { productId: product.id, productName: product.name } })));
    expect($('a').attr('href')).toMatch(/^\/contacto\?/);
    expect($('a').attr('target')).toBeUndefined();
    expect($('a').attr('aria-label')).toContain(product.name);
  });

  it('las tarjetas mantienen la navegación y el reporte fuera del enlace envolvente', () => {
    const $ = load(renderToStaticMarkup(createElement(ProductCard, { product })));
    const card = $('article'), link = card.parent('a');
    expect(link.attr('href')).toBe('/product/cpu-7');
    expect(link.find('a')).toHaveLength(0);
    expect(card.find('a[href^="/contacto"]')).toHaveLength(0);
    const report = $('a[href^="/contacto"]');
    expect(report.parent()[0]).toBe(link.parent()[0]);
    expect(report.attr('href')).toContain('storeId=mexx');
  });

  it('cada fila de tienda conserva su enlace externo y reporta esa oferta', () => {
    const $ = load(renderToStaticMarkup(createElement(StoresList, { product, merchantPrices: product.prices })));
    expect($('a[target="_blank"]').attr('href')).toBe(product.prices[0].url);
    expect($('a[href^="/contacto"]').attr('href')).toContain('storeName=Mexx');
    expect($('a a')).toHaveLength(0);
  });

  it('una referencia de guía se reporta con su producto real, sin promoverla al presupuesto', () => {
    const missing: ResolvedGuideComponent = { name: 'CPU editorial', description: '', price: 0, priceSource: 'estimate',
      bestStoreName: null, bestStoreUrl: null, storeCount: 0, storeNames: [], offers: [] };
    const slots = Object.fromEntries(GUIDE_SLOT_KEYS.map((key) => [key, missing])) as Record<GuideSlotKey, ResolvedGuideComponent>;
    const $ = load(renderToStaticMarkup(createElement(GuideComponentRows, { slots, references: { cpu: {
      productId: product.id, productName: product.name, storeId: 'mexx', storeName: 'Mexx', price: 100_000,
      url: product.prices[0].url, lastUpdated: new Date().toISOString(),
    } } })));
    const report = $('a[href^="/contacto"]');
    expect(report).toHaveLength(1);
    expect(new URL(report.attr('href')!, 'https://catalog.example').searchParams.get('productName')).toBe(product.name);
    expect($('a a')).toHaveLength(0);
    expect($.text()).toContain('No confirma el precio ni el stock actuales');
  });
});
