import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductImageWithFallback } from './ProductImageWithFallback';

describe('ProductImageWithFallback', () => {
  it('declares intrinsic dimensions to prevent layout shifts', () => {
    const markup = renderToStaticMarkup(createElement(ProductImageWithFallback, {
      src: 'https://images.example/product.webp',
      alt: 'Producto',
    }));

    expect(markup).toContain('width="512"');
    expect(markup).toContain('height="512"');
  });
});
