import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PriceIndexChart } from './PriceIndexChart';

describe('PriceIndexChart', () => {
  it('renders an accessible stepped SVG with a textual title and description', () => {
    const markup = renderToStaticMarkup(createElement(PriceIndexChart, {
      series: [{
        id: 'procesadores',
        label: 'Procesadores',
        variations: { days7: 4, days30: null, days90: null },
        points: [
          { date: '2026-05-01', medianPriceArs: 100, index: 100, productCount: 2, offerCount: 3 },
          { date: '2026-05-08', medianPriceArs: 104, index: 104, productCount: 2, offerCount: 3 },
        ],
      }],
    }));

    expect(markup).toContain('<svg');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('<title');
    expect(markup).toContain('<desc');
    expect(markup).toContain('H');
    expect(markup).toContain('Procesadores');
  });
});
