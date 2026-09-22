import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArmarPcView } from '@/components/seo/ArmarPcView';

describe('ArmarPcView', () => {
  it('muestra el formulario sin armar combo si no hay presupuesto', () => {
    const markup = renderToStaticMarkup(
      createElement(ArmarPcView, { budget: null, submitted: false }),
    );

    expect(markup).toContain('Armá tu PC gamer con un presupuesto');
    expect(markup).toContain('name="pesos"');
    expect(markup).toContain('Cargando catálogo');
    expect(markup).toContain('Componentes de tu PC');
    expect(markup).toContain('Actualizar estas ofertas');
    expect(markup).toContain('Enviarnos un mensaje');
    expect(markup).not.toContain('TOTAL CON STOCK');
  });

  it('rechaza un monto invalido sin armar combo', () => {
    const markup = renderToStaticMarkup(
      createElement(ArmarPcView, { budget: null, submitted: true }),
    );

    expect(markup).toMatch(/entre/i);
    expect(markup).not.toContain('TOTAL CON STOCK');
  });
});
