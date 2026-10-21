import { expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { BUILDER_RAM_REFERENCES, planBuilderRamTargets } from './builder-ram-planning';

const now = Date.parse('2026-10-21T12:00:00Z');
const products = () => BUILDER_RAM_REFERENCES.map(reference => ({ id: reference.id,
  name: 'Memoria Corsair', category: 'memoria-ram', specs: { SKU: reference.sku },
  prices: [{ storeId: 'compragamer', url: reference.url, lastUpdated: new Date(now - 4 * 3600_000) }],
} as unknown as Product));

it('limita el plan a tres publicaciones exactas y no modifica productos ni observaciones', () => {
  const input = products(), before = structuredClone(input);
  input[0].prices.push({ ...input[0].prices[0], url: 'https://compragamer.com/producto/Oferta_similar_999' });
  const result = planBuilderRamTargets(input, now);
  expect(result.missing).toEqual([]);
  expect(result.targets).toEqual(BUILDER_RAM_REFERENCES.map(reference => ({ productId: reference.id,
    storeId: 'compragamer', url: reference.url })));
  expect(input.slice(1)).toEqual(before.slice(1));
  expect(input[0].prices[0]).toEqual(before[0].prices[0]);
});

it('no sustituye una referencia ausente, otra categoría, MPN o URL', () => {
  const input = products();
  input[0].specs.SKU = 'OTRA-VARIANTE'; input[1].category = 'computadoras';
  input[2].prices[0].url = 'https://compragamer.com/producto/Oferta_similar_999';
  expect(planBuilderRamTargets(input, now)).toEqual({ targets: [], missing: BUILDER_RAM_REFERENCES.map(item => item.id) });
});

it('una fecha reciente sin prueba de identidad sigue requiriendo observación', () => {
  const input = products(); input.forEach(product => { product.prices[0].lastUpdated = new Date(now - 1000); });
  expect(planBuilderRamTargets(input, now).targets).toHaveLength(3);
});
