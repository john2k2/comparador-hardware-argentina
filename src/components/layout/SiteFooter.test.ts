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
    expect(markup).toContain('Comparar');
    expect(markup).toContain('/comparativa/comparar');
    expect(markup).not.toContain('/tiendas');
    expect(markup).toContain('Informacion');
    expect(markup.match(/href="\/acerca"/g)).toHaveLength(1);
    expect(markup).not.toContain('/indice-precios-hardware');
    expect(markup).toContain('max-w-[1440px]');
  });
});
