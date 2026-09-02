import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GuiasIndexPage from './page';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';

describe('GuiasIndexPage', () => {
  it('no publica chips de keywords ni FPS sin fuente', () => {
    const markup = renderToStaticMarkup(createElement(GuiasIndexPage));

    expect(markup).not.toContain('pc gamer barata argentina');
    expect(markup).not.toContain('pc gamer 1 millon');
    expect(markup).not.toMatch(/benchmarks reales/i);
    expect(markup).toContain('oferta en stock');
    expect(markup).toContain(`Actualizado: ${EDITORIAL_UPDATED_AT}`);
  });
});
