import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from './SiteFooter';

describe('SiteFooter', () => {
  it('no usa h2 para columnas de navegación', () => {
    const markup = renderToStaticMarkup(createElement(SiteFooter));

    expect(markup).not.toMatch(/<h2[\s>]/);
    expect(markup).toContain('Comparador Hardware');
    expect(markup).toContain('Categorias');
    expect(markup).toContain('Tiendas');
    expect(markup).toContain('Informacion');
  });
});
