import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { MotherboardMemorySupport } from './MotherboardMemorySupport';

function render(category: Product['category'], brand = 'ASUS') {
  return renderToStaticMarkup(createElement(MotherboardMemorySupport, { product: {
    category, brand, name: 'Motherboard B650', model: 'B650',
    specs: { QVL: 'javascript:alert(1)' },
  } as unknown as Product }));
}

describe('MotherboardMemorySupport', () => {
  it('no ofrece una QVL de motherboard en una ficha de RAM', () => {
    expect(render('memoria-ram')).toBe('');
  });

  it('no inventa una URL de modelo ni usa enlaces recibidos de tiendas', () => {
    const html = render('motherboards');
    expect(html).toContain('https://www.asus.com/support/download-center/');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('todavía no verificamos la QVL');
    expect(html).not.toContain('href="https://www.msi.com');
  });

  it('permite elegir una fuente oficial cuando falta la marca sin atribuir ASUS al producto', () => {
    const html = render('motherboards', 'Desconocida');
    expect(html).toContain('No identificamos un fabricante');
    expect((html.match(/<a /g) ?? [])).toHaveLength(4);
    expect(html).toContain('no demuestra incompatibilidad');
  });
});
