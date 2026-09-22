import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
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
    lastUpdated: new Date('2026-09-21T12:00:00.000Z'),
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

    const detectedPriceSection = markup.slice(markup.indexOf('MEJOR PRECIO DETECTADO'));
    expect(detectedPriceSection).toContain('80.000');
    expect(detectedPriceSection).not.toContain('120.000');
    expect(detectedPriceSection).not.toContain('999.999');
    expect(detectedPriceSection).toContain('3 cuotas de');
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

    expect(markup).toContain('OFERTAS POR CORROBORAR');
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
});
