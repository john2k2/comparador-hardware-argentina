import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ComparativasIndexPage from './page';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';

describe('ComparativasIndexPage', () => {
  it('muestra la blurb y no dumps de keywords', () => {
    const markup = renderToStaticMarkup(createElement(ComparativasIndexPage));

    expect(markup).toContain('Compará precios de RTX 4060 vs RX 7600');
    expect(markup).not.toContain('mejor placa video 1080p');
    expect(markup).not.toContain('4060 vs 7600 argentina');
    expect(markup).toContain(`Actualizado: ${EDITORIAL_UPDATED_AT}`);
  });
});
