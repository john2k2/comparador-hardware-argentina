import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ParallaxSky } from './ParallaxSky';

const markup = renderToStaticMarkup(createElement(ParallaxSky));
const spriteSheet = readFileSync(join(process.cwd(), 'public/sprites/pixel-art.svg'), 'utf8');

describe('fondo parallax pixel-art', () => {
  it('referencia sólo sprites que existen en la hoja pública', () => {
    const references = [...markup.matchAll(/<use href="([^"]+)"/g)].map((match) => match[1]);
    expect(references.length).toBe(12);
    for (const reference of references) {
      const [file, id] = reference.split('#');
      expect(file).toBe('/sprites/pixel-art.svg');
      expect(spriteSheet).toContain(`id="${id}"`);
    }
  });

  it('define inline cada patrón usado como relleno y sin animaciones SMIL', () => {
    const fills = [...markup.matchAll(/fill="url\(#([^)]+)\)"/g)].map((match) => match[1]);
    expect(fills).toEqual(['stars-small', 'stars-medium']);
    for (const id of fills) expect(markup).toContain(`<pattern id="${id}"`);
    expect(markup).not.toContain('<animate');
  });

  it('no aplica filtros por sprite desde estilos inline', () => {
    expect(markup).not.toContain('drop-shadow');
    expect(markup).not.toContain('filter:');
  });
});
