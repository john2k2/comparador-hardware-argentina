import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { CATALOG_OFFER_FRESH_MS } from '@/lib/price-freshness';
import { ProductCard } from '../functional/ProductCard';
import { PriceSummary } from './PriceSummary';
import { StoresList } from './StoresList';

function product(): Product {
  return {
    id: 'cpu-7800x3d',
    name: 'AMD Ryzen 7 7800X3D',
    category: 'procesadores',
    brand: 'AMD',
    model: 'Ryzen 7 7800X3D',
    specs: {},
    prices: [],
    lowestPrice: 80_000,
    highestPrice: 120_000,
    averagePrice: 100_000,
    createdAt: new Date('2026-09-20T00:00:00.000Z'),
    updatedAt: new Date('2026-09-21T00:00:00.000Z'),
  };
}

function offer(overrides: Partial<ProductPrice> = {}): ProductPrice {
  return {
    storeId: 'store-main',
    storeName: 'Tienda Principal',
    url: 'https://store.example/amd-ryzen-7-7800x3d',
    price: 80_000,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date(),
    ...overrides,
  };
}

function consistentReview(url: string) {
  return {
    version: 1 as const,
    status: 'consistent' as const,
    reason: 'consistent-text' as const,
    reviewedAt: '2026-09-21T12:00:00.000Z',
    model: 'jev-1.13.0',
    confidence: 0.95,
    subject: { name: 'amd ryzen 7 7800x3d', category: 'procesadores', url },
  };
}

function pendingReview(url: string) {
  return {
    version: 1 as const,
    status: 'needs-review' as const,
    reason: 'low-confidence' as const,
    reviewedAt: '2026-09-21T12:00:00.000Z',
    model: 'jev-1.13.0',
    confidence: 0.72,
    subject: { name: 'amd ryzen 7 7800x3d', category: 'procesadores', url },
  };
}

describe('offer identity display', () => {
  it('keeps a black PSU publication out of the best price for a white variant even without a prior review', () => {
    const item = { ...product(), name: 'Fuente RAPTOR VOLT 1000W Full Modular Blanca', category: 'fuentes-alimentacion' as const };
    const prices = [offer({ url: 'https://store.example/fuente-raptor-volt-1000w-full-modular-negra' })];
    const summary = renderToStaticMarkup(createElement(PriceSummary, {
      product: item, merchantPrices: prices, lowestComparablePrice: 80_000,
      highestComparablePrice: 80_000, selectedInstallment: null, onSelectInstallment: vi.fn(),
    }));
    expect(summary).toContain('SIN OFERTAS APTAS PARA COMPARAR');
    expect(summary).not.toContain('MEJOR PRECIO REGISTRADO');
    const stores = renderToStaticMarkup(createElement(StoresList, { product: item, merchantPrices: prices }));
    expect(stores).toContain('Identidad por corroborar');
    expect(stores).not.toContain('[ MEJOR PRECIO ]');
  });
  it.each(['', 'javascript:alert(1)', 'https://user:password@store.example/item'])('does not highlight or link to an invalid destination %s', (url) => {
    const prices = [offer({ url })];
    const summary = renderToStaticMarkup(createElement(PriceSummary, {
      product: product(), merchantPrices: prices, lowestComparablePrice: 80_000,
      highestComparablePrice: 80_000, selectedInstallment: null, onSelectInstallment: vi.fn(),
    }));
    expect(summary).toContain('SIN OFERTAS APTAS PARA COMPARAR');
    expect(summary).not.toContain('Ver en Tienda Principal');
    const list = renderToStaticMarkup(createElement(StoresList, { product: product(), merchantPrices: prices }));
    expect(list).toContain('Enlace por corroborar');
    expect(list).not.toContain('VER EN TIENDA');
  });
  it('does not invent a zero saving for one store and links to the observed offer', () => {
    const markup = renderToStaticMarkup(createElement(PriceSummary, {
      product: product(), merchantPrices: [offer()], lowestComparablePrice: 80_000,
      highestComparablePrice: 80_000, selectedInstallment: null, onSelectInstallment: vi.fn(),
    }));
    expect(markup).toContain('Una tienda con oferta comparable');
    expect(markup).not.toContain('Ahorro');
    expect(markup).not.toContain('0%');
    expect(markup).toContain('href="https://store.example/amd-ryzen-7-7800x3d"');
    expect(markup).toContain('Precio relevado:');
  });
  it('identifica el total financiado sin presentarlo como precio de contado', () => {
    const installment = { count: 3, amount: 30_000, totalAmount: 90_000, interest: true };
    const markup = renderToStaticMarkup(createElement(PriceSummary, {
      product: product(), merchantPrices: [offer({ installment })],
      lowestComparablePrice: 80_000, highestComparablePrice: 80_000,
      selectedInstallment: installment, onSelectInstallment: vi.fn(),
    }));
    expect(markup).toContain('TOTAL EN 3 CUOTAS');
    expect(markup).not.toContain('MEJOR PRECIO DETECTADO');
  });

  it('chooses the lowest eligible offer regardless of order and ignores a stale selected installment', () => {
    const expensive = offer({
      storeId: 'store-expensive', storeName: 'Tienda Cara', price: 120_000,
      installment: { count: 6, amount: 22_000, totalAmount: 132_000, interest: true },
    });
    const cheapest = offer({
      storeId: 'store-cheap', storeName: 'Tienda Barata', price: 80_000,
      installment: { count: 3, amount: 30_000, totalAmount: 90_000, interest: false },
    });
    const staleSelectedInstallment = { count: 1, amount: 999_999, totalAmount: 999_999, interest: false };

    const markup = renderToStaticMarkup(createElement(PriceSummary, {
      product: product(),
      merchantPrices: [expensive, cheapest],
      lowestComparablePrice: 80_000,
      highestComparablePrice: 120_000,
      selectedInstallment: staleSelectedInstallment,
      onSelectInstallment: vi.fn(),
    }));

    const detectedPriceSection = markup.slice(markup.indexOf('MEJOR PRECIO REGISTRADO'), markup.indexOf('tiendas con oferta comparable'));
    expect(detectedPriceSection).toContain('80.000');
    expect(detectedPriceSection).not.toContain('120.000');
    expect(detectedPriceSection).not.toContain('999.999');
    expect(markup).toContain('3 cuotas de');
  });

  it('does not show a detected price or a zero price when every offer is pending', () => {
    const pending = offer({
      storeId: 'store-pending', storeName: 'Tienda Pendiente', price: 70_000,
      identityReview: pendingReview('https://store.example/amd-ryzen-7-7800x3d'),
    });

    const markup = renderToStaticMarkup(createElement(PriceSummary, {
      product: product(),
      merchantPrices: [pending],
      lowestComparablePrice: 0,
      highestComparablePrice: 0,
      selectedInstallment: null,
      onSelectInstallment: vi.fn(),
    }));

    expect(markup).toContain('SIN OFERTAS APTAS PARA COMPARAR');
    expect(markup).not.toContain('MEJOR PRECIO DETECTADO');
    expect(markup).not.toMatch(/\$\s*0/);
  });

  it('keeps pending stores visible with their observed date while labeling only the valid best offer', () => {
    const pending = offer({
      storeId: 'store-pending', storeName: 'Tienda Pendiente', price: 70_000,
      url: 'https://store.example/amd-ryzen-7-7800x3d-pending',
      identityReview: pendingReview('https://store.example/amd-ryzen-7-7800x3d-pending'),
    });
    const valid = offer({
      storeId: 'store-valid', storeName: 'Tienda Válida', price: 80_000,
      url: 'https://store.example/amd-ryzen-7-7800x3d-valid',
      identityReview: consistentReview('https://store.example/amd-ryzen-7-7800x3d-valid'),
    });

    const markup = renderToStaticMarkup(createElement(StoresList, {
      product: product(),
      merchantPrices: [pending, valid],
    }));
    const pendingPosition = markup.indexOf('@Tienda Pendiente');
    const validPosition = markup.indexOf('@Tienda Válida');
    const bestPosition = markup.indexOf('[ MEJOR PRECIO ]');

    expect(markup).toContain('Identidad por corroborar');
    expect(markup).toContain('Precio relevado:');
    expect(markup.match(/Precio relevado:/g)).toHaveLength(2);
    expect(pendingPosition).toBeGreaterThanOrEqual(0);
    expect(validPosition).toBeGreaterThan(pendingPosition);
    expect(bestPosition).toBeGreaterThan(pendingPosition);
    expect(bestPosition).toBeLessThan(validPosition);
    expect(markup.match(/\[ MEJOR PRECIO \]/g)).toHaveLength(1);
  });

  it('shows the eligible offer in a product card even when a cheaper offer is pending', () => {
    const pending = offer({
      storeId: 'store-pending', storeName: 'Tienda Pendiente', price: 50_000,
      url: 'https://store.example/amd-ryzen-7-7800x3d-pending-card',
      identityReview: pendingReview('https://store.example/amd-ryzen-7-7800x3d-pending-card'),
    });
    const valid = offer({
      storeId: 'store-valid', storeName: 'Tienda Válida', price: 100_000,
      url: 'https://store.example/amd-ryzen-7-7800x3d-valid-card',
      identityReview: consistentReview('https://store.example/amd-ryzen-7-7800x3d-valid-card'),
    });

    const markup = renderToStaticMarkup(createElement(ProductCard, {
      product: { ...product(), prices: [pending, valid] },
      showStore: true,
    }));

    expect(markup).toContain('MEJOR PRECIO');
    expect(markup).toContain('100.000');
    expect(markup).not.toContain('50.000');
    expect(markup).toContain('@Tienda Válida');
  });

  it('shows no comparable offer in a product card when all offers are pending', () => {
    const pending = offer({
      storeId: 'store-pending', storeName: 'Tienda Pendiente', price: 50_000,
      identityReview: pendingReview('https://store.example/amd-ryzen-7-7800x3d'),
    });

    const markup = renderToStaticMarkup(createElement(ProductCard, {
      product: { ...product(), prices: [pending] },
      showStore: true,
    }));

    expect(markup).toContain('Sin oferta disponible para comparar');
    expect(markup).not.toContain('MEJOR PRECIO');
    expect(markup).not.toMatch(/\$\s*0/);
  });

  it('shows an old price only as reference and never labels it best', () => {
    const old = offer({ price: 50_000, lastUpdated: new Date(Date.now() - CATALOG_OFFER_FRESH_MS - 1) });
    const currentProduct = { ...product(), prices: [old] };
    const card = renderToStaticMarkup(createElement(ProductCard, { product: currentProduct }));
    const stores = renderToStaticMarkup(createElement(StoresList, { product: currentProduct, merchantPrices: [old] }));
    const summary = renderToStaticMarkup(createElement(PriceSummary, {
      product: currentProduct, merchantPrices: [old], lowestComparablePrice: 50_000,
      highestComparablePrice: 50_000, selectedInstallment: null, onSelectInstallment: vi.fn(),
    }));

    expect(card).toContain('ÚLTIMO PRECIO RELEVADO');
    expect(card).not.toContain('MEJOR PRECIO');
    expect(stores).toContain('PENDIENTE DE ACTUALIZAR');
    expect(stores).not.toContain('[ MEJOR PRECIO ]');
    expect(summary).toContain('referencias anteriores');
    expect(summary).toContain('PRECIOS PENDIENTES DE ACTUALIZAR');
    expect(summary).not.toContain('MEJOR PRECIO DETECTADO');
  });

  it('compares a recent offer without letting an old cheaper price win', () => {
    const old = offer({ storeId: 'store-old', storeName: 'Anterior', price: 50_000,
      lastUpdated: new Date(Date.now() - CATALOG_OFFER_FRESH_MS - 1) });
    const recent = offer({ storeId: 'store-recent', storeName: 'Reciente', price: 90_000,
      url: 'https://store.example/amd-ryzen-7-7800x3d-recent' });
    const currentProduct = { ...product(), prices: [old, recent] };
    const card = renderToStaticMarkup(createElement(ProductCard, { product: currentProduct }));
    const stores = renderToStaticMarkup(createElement(StoresList, { product: currentProduct, merchantPrices: [old, recent] }));

    expect(card).toContain('MEJOR PRECIO REGISTRADO');
    expect(card).not.toContain('MEJOR PRECIO RELEVADO EN 3 H');
    expect(card).toContain('90.000');
    expect(card).not.toContain('50.000');
    expect(stores.match(/\[ MEJOR PRECIO \]/g)).toHaveLength(1);
    expect(stores.indexOf('[ MEJOR PRECIO ]')).toBeGreaterThan(stores.indexOf('@Anterior'));
    expect(stores.indexOf('[ MEJOR PRECIO ]')).toBeLessThan(stores.indexOf('@Reciente'));
  });
});
