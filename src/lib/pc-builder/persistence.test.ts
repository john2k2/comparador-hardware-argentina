import { describe, expect, it } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { emptyBuild, type BuildDraft } from './types';
import { createBuildShareUrl, createWhatsAppShareUrl, decodeBuild, encodeBuild, exportBuildText, parseBuildDraft } from './persistence';

function price(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'storeName' | 'price'>): ProductPrice {
  return {
    url: `https://store.example/${overrides.storeId}`,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'category'>): Product {
  const prices = overrides.prices ?? [];
  const lowest = prices.length ? Math.min(...prices.map((item) => item.price)) : 0;
  return {
    brand: 'AMD',
    model: overrides.name,
    specs: {},
    prices,
    lowestPrice: lowest,
    highestPrice: lowest,
    averagePrice: lowest,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

function draftWithCpu(overrides: Partial<BuildDraft> = {}): BuildDraft {
  return {
    ...emptyBuild(1_500_000),
    selections: {
      cpu: { productId: 'cpu-ñ', storeId: 'tienda-á', url: 'https://store.example/ryzen-%C3%B1', quantity: 1 },
    },
    shipping: { 'tienda-á': 12_345.67 },
    ...overrides,
  };
}

describe('build persistence', () => {
  it('round-trips a valid draft with Unicode identifiers and URLs', () => {
    const draft = draftWithCpu();

    expect(decodeBuild(encodeBuild(draft))).toEqual(draft);
  });

  it('rejects invalid versions, budget limits, and oversized encoded payloads', () => {
    const draft = emptyBuild();

    expect(parseBuildDraft({ ...draft, version: 2 })).toBeNull();
    expect(parseBuildDraft({ ...draft, budget: 399_999 })).toBeNull();
    expect(parseBuildDraft({ ...draft, budget: 20_000_001 })).toBeNull();
    expect(decodeBuild('a'.repeat(32_001))).toBeNull();
  });

  it('shares only shipping costs for the currently selected stores', () => {
    const draft = draftWithCpu({ shipping: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`old-${i}`, 1000])) });
    draft.shipping['tienda-á'] = 2000;
    expect(decodeBuild(encodeBuild(draft))?.shipping).toEqual({ 'tienda-á': 2000 });
  });

  it('creates a share URL that round-trips the draft without embedding prices', () => {
    const draft = draftWithCpu({ budget: 1_750_000 });
    const shareUrl = createBuildShareUrl(draft, 'https://www.example.com');
    const parsed = new URL(shareUrl);
    const encoded = new URLSearchParams(parsed.hash.slice(1)).get('pc');

    expect(parsed.origin).toBe('https://www.example.com');
    expect(parsed.pathname).toBe('/guia/armar');
    expect(parsed.searchParams.get('pesos')).toBe('1750000');
    expect(encoded).toBeTruthy();
    expect(decodeBuild(encoded!)).toEqual(draft);
    expect(shareUrl).not.toMatch(/price|lastUpdated|100000/);
  });

  it('builds a WhatsApp href containing the same share link without sending anything', () => {
    const draft = draftWithCpu();
    const shareUrl = createBuildShareUrl(draft, 'https://www.example.com');
    const whatsappUrl = createWhatsAppShareUrl(draft, 'https://www.example.com');
    const message = new URL(whatsappUrl).searchParams.get('text') ?? '';

    expect(new URL(whatsappUrl).origin).toBe('https://wa.me');
    expect(message).toContain(shareUrl);
    expect(message).toContain('presupuesto objetivo');
    expect(whatsappUrl).not.toContain('100000');
  });

  it('rejects CPU quantities greater than one', () => {
    const draft = draftWithCpu({ selections: { cpu: { ...draftWithCpu().selections.cpu!, quantity: 2 } } });

    expect(parseBuildDraft(draft)).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'https://user:password@store.example/cpu',
  ])('rejects unsafe selection URL %s', (url) => {
    const draft = draftWithCpu({ selections: { cpu: { ...draftWithCpu().selections.cpu!, url } } });

    expect(parseBuildDraft(draft)).toBeNull();
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects reserved shipping key %s', (key) => {
    const draft = JSON.parse(JSON.stringify(draftWithCpu())) as Record<string, unknown>;
    draft.shipping = { [key]: 1 };

    expect(parseBuildDraft(draft)).toBeNull();
  });

  it('exports a partial total and preserves the original offer date', () => {
    const oldOffer = price({ storeId: 'tienda-á', storeName: 'Tienda Á', price: 100_000, url: 'https://store.example/ryzen-%C3%B1' });
    const draft = draftWithCpu({ shipping: {} });
    const output = exportBuildText(draft, [product({ id: 'cpu-ñ', name: 'Ryzen 5 5600', category: 'procesadores', prices: [oldOffer] })], new Date('2026-09-21T12:00:00.000Z'));

    expect(output).toContain('Total calculado parcial:');
    expect(output).toContain(`Fecha de oferta: ${oldOffer.lastUpdated.toLocaleString('es-AR')}`);
    expect(output).toMatch(/Envíos ingresados por el usuario: \$\s*0/);
    expect(output).not.toContain('Total calculado: $100.000');
  });
});
