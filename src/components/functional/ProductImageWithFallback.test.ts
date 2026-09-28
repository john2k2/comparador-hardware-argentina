import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductImageWithFallback } from './ProductImageWithFallback';

describe('ProductImageWithFallback', () => {
  it('renderiza la foto directa de CompraGamer corrigiendo una URL antigua', () => {
    const markup = renderToStaticMarkup(createElement(ProductImageWithFallback, {
      src: 'https://imagenes.compragamer.com/compragamer_Imganen_general_cpu-med.jpg',
      alt: 'Procesador',
    }));
    expect(markup).toContain('src="https://imagenes.compragamer.com/productos/compragamer_Imganen_general_cpu-med.jpg"');
    expect(markup).not.toContain('Imagen no disponible');
  });

  it('declares intrinsic dimensions to prevent layout shifts', () => {
    const markup = renderToStaticMarkup(createElement(ProductImageWithFallback, {
      src: 'https://images.example/product.webp',
      alt: 'Producto',
    }));

    expect(markup).toContain('width="512"');
    expect(markup).toContain('height="512"');
  });
});
