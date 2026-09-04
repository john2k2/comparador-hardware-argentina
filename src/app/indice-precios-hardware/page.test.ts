import { Children, createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getHardwarePriceIndex: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('@/lib/price-index/server', () => ({ getHardwarePriceIndex: mocks.getHardwarePriceIndex }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));

import HardwarePriceIndexPage, { buildPriceIndexJsonLd, PriceIndexPageContent, metadata } from './page';

const snapshot = {
  status: 'ready' as const,
  updatedAt: '2026-06-08T00:00:00.000Z',
  coverage: { startDate: '2026-06-01', endDate: '2026-06-08', productCount: 4, offerCount: 7, categoryCount: 1 },
  series: [{
    id: 'procesadores' as const,
    label: 'Procesadores',
    variations: { days7: 10, days30: null, days90: null },
    points: [
      { date: '2026-06-01', index: 100, medianPriceArs: 200000, productCount: 4, offerCount: 7 },
      { date: '2026-06-08', index: 110, medianPriceArs: 220000, productCount: 4, offerCount: 7 },
    ],
  }],
};

describe('hardware price index page', () => {
  it('publishes canonical metadata and safe Dataset/WebPage structured data', () => {
    expect(metadata.alternates?.canonical).toContain('/indice-precios-hardware');
    const graph = buildPriceIndexJsonLd(snapshot);
    expect(graph['@graph'].map((entry) => entry['@type'])).toEqual(['WebPage', 'Dataset']);
    expect(JSON.stringify(graph)).toContain('/indice-precios-hardware/datos.csv');
    expect(JSON.stringify(graph)).not.toContain('<script');
  });

  it('explains coverage and methodology, and offers the aggregate CSV', () => {
    const markup = renderToStaticMarkup(createElement(PriceIndexPageContent, { snapshot }));

    expect(markup).toContain('Qué pasó con el precio del hardware esta semana');
    expect(markup).toContain('Actualizado: 2026-06-08');
    expect(markup).toContain('Descargar datos agregados');
    expect(markup).toContain('sesgo de supervivencia');
    expect(markup).toContain('365 días');
    expect(markup).toContain('application/ld+json');
  });

  it('applies the request CSP nonce to its inline structured-data script', async () => {
    mocks.getHardwarePriceIndex.mockResolvedValue(snapshot);
    mocks.headers.mockResolvedValue(new Headers({ 'x-content-security-policy-nonce': 'nonce-123' }));

    const markup = renderToStaticMarkup(await HardwarePriceIndexPage());

    expect(mocks.headers).toHaveBeenCalledOnce();
    expect(markup).toContain('nonce="nonce-123"');
  });

  it('suppresses CSP nonce hydration mismatch on the json-ld script', () => {
    const tree = PriceIndexPageContent({ snapshot, nonce: 'nonce-123' });
    const script = Children.toArray(tree.props.children).find(
      (child) => isValidElement(child) && child.type === 'script',
    );

    expect(isValidElement(script) && script.props.suppressHydrationWarning).toBe(true);
  });

  it('links visibly to every category represented by the index', () => {
    const markup = renderToStaticMarkup(createElement(PriceIndexPageContent, { snapshot }));

    expect(markup).toContain('href="/comparar/procesadores"');
    expect(markup).toContain('href="/comparar/placas-de-video"');
    expect(markup).toContain('href="/comparar/memoria-ram"');
    expect(markup).toContain('href="/comparar/almacenamiento"');
  });

  it('renders a transparent empty state without placeholder figures', () => {
    const markup = renderToStaticMarkup(createElement(PriceIndexPageContent, {
      snapshot: { status: 'empty', updatedAt: null, coverage: null, series: [] },
    }));

    expect(markup).toContain('Todavía no hay suficientes datos');
    expect(markup).toContain('Cómo medimos el precio del hardware en Argentina');
    expect(markup).not.toContain('Qué pasó con el precio del hardware esta semana');
    expect(markup).not.toContain('Actualizado:');
    expect(markup).not.toContain('$0');
  });
});
