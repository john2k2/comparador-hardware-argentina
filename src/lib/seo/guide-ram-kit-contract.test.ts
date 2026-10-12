import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { buildGuideNameFilters } from '@/lib/persistence/product-read-helpers';
import { resolveGuideComponent, resolveGuideRefreshOffers } from '@/lib/seo/budget-guide-pricing';
import { readGuideRamKit } from '@/lib/catalog/guide-ram-kit';

const formats = ['2x16GB', '2 x16GB', '2 x 16 GB'];
const specFor = (format: string) => ({
  name: `Corsair Vengeance 32GB DDR5 6000MHz CL30 Negro RGB (${format})`,
  exactModel: 'Vengeance', searchTerms: ['corsair vengeance 32gb ddr5 negro rgb'],
  category: 'memoria-ram' as const, description: 'Kit de dos módulos de 16 GB', estimatedPrice: 1_202_121.97,
});
const candidate = (format: string, replace?: [string, string]): Product => {
  const name = `Memoria Ram UDIMM CORSAIR VENGEANCE 32GB DDR5 6000MHz CL30 1.40V (${format}) Negro RGB`;
  return {
    id: 'goldentechstore-api-188718', name: replace ? name.replace(...replace) : name,
    category: 'memoria-ram', brand: 'Corsair', model: name, specs: { SKU: 'EL_CORM5VR2X1660' },
    lowestPrice: 1_202_121.97, highestPrice: 1_202_121.97, averagePrice: 1_202_121.97,
    prices: [{ storeId: 'goldentechstore', storeName: 'Golden Tech', price: 1_202_121.97, stock: 'in-stock', installment: null,
      url: 'https://goldentechstore.com.ar/producto/memoria-ram-udimm-corsair-vengeance-32gb-ddr5-6000mhz-cl30-1-40v-2-x-16gb-negro-rgb/',
      lastUpdated: new Date('2026-10-11T13:15:50.661Z') }],
    createdAt: new Date('2026-10-11T13:15:50.661Z'), updatedAt: new Date('2026-10-11T13:15:50.661Z'),
  };
};
const passesPrefilter = (name: string, spec: ReturnType<typeof specFor>) => {
  const filters = buildGuideNameFilters('memoria-ram', spec);
  return filters.include.every(pattern => new RegExp(pattern, 'i').test(name))
    && filters.exclude.every(pattern => !new RegExp(pattern, 'i').test(name));
};

afterEach(() => vi.useRealTimers());

describe('contrato del kit de RAM con espacios', () => {
  it.each(formats.flatMap(specFormat => formats.map(actualFormat => [specFormat, actualFormat])))
    ('%s conserva el mismo kit declarado como %s', (specFormat, actualFormat) => {
      vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
      const spec = specFor(specFormat), item = candidate(actualFormat), before = structuredClone(item);
      expect(passesPrefilter(item.name, spec)).toBe(true);
      expect(resolveGuideComponent(spec, [item])).toMatchObject({ productId: item.id, priceSource: 'catalog', price: 1_202_121.97 });
      expect(resolveGuideRefreshOffers(spec, [item])[0]).toMatchObject({ productId: item.id, lastUpdated: '2026-10-11T13:15:50.661Z' });
      expect(item).toEqual(before);
    });

  it.each(['', '1x32GB', '2x8GB', '4x8GB', '2x16GB y 4x8GB'])('rechaza una composición distinta o ambigua: %s', format => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
    for (const specFormat of formats) {
      const spec = specFor(specFormat), item = candidate(format);
      expect(resolveGuideComponent(spec, [item]).offers).toEqual([]);
      expect(resolveGuideRefreshOffers(spec, [item])).toEqual([]);
      if (!format.includes(' y ')) expect(passesPrefilter(item.name, spec)).toBe(false);
    }
  });

  it('un kit editorial ambiguo no evade la guarda', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
    const spec = specFor('2x16GB o 4x8GB'), item = candidate('2x16GB');
    expect(passesPrefilter(item.name, spec)).toBe(false);
    expect(resolveGuideComponent(spec, [item]).offers).toEqual([]);
    expect(resolveGuideRefreshOffers(spec, [item])).toEqual([]);
  });

  it.each(['2-x-16gb-o-4-x-8gb', '4-x-8gb-o-2-x-16gb'])
    ('rechaza una URL con composición ambigua en cualquier orden: %s', kits => {
      vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
      const item = candidate('2 x 16 GB');
      item.prices[0].url = `https://goldentechstore.com.ar/producto/corsair-vengeance-32gb-ddr5-6000mhz-cl30-${kits}-negro-rgb/`;
      expect(resolveGuideComponent(specFor('2 x 16 GB'), [item]).offers).toEqual([]);
      expect(resolveGuideRefreshOffers(specFor('2 x 16 GB'), [item])).toEqual([]);
    });

  it.each(['2 x 16 GB o 4 x 8 GB', '4 x 8 GB o 2 x 16 GB'])
    ('rechaza un título de fuente con composición ambigua en cualquier orden: %s', kits => {
      vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
      const item = candidate('2 x 16 GB');
      item.prices[0].sourceIdentity = { listingRef: 'goldentechstore:url:' + item.prices[0].url.replace(/\/$/, ''),
        title: item.name.replace('2 x 16 GB', kits) };
      expect(resolveGuideComponent(specFor('2 x 16 GB'), [item]).offers).toEqual([]);
      expect(resolveGuideRefreshOffers(specFor('2 x 16 GB'), [item])).toEqual([]);
    });

  it.each(['4%2Dx%2D8gb', '4%09x%098gb'].flatMap(encoded => [
    `2-x-16gb-o-${encoded}`, `${encoded}-o-2-x-16gb`,
  ]))('rechaza composiciones ambiguas codificadas en la ruta: %s', kits => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
    const item = candidate('2 x 16 GB');
    item.prices[0].url = `https://goldentechstore.com.ar/producto/corsair-vengeance-32gb-ddr5-6000mhz-cl30-${kits}-negro-rgb/`;
    expect(resolveGuideComponent(specFor('2 x 16 GB'), [item]).offers).toEqual([]);
    expect(resolveGuideRefreshOffers(specFor('2 x 16 GB'), [item])).toEqual([]);
  });

  it('una codificación inválida no lanza errores ni acredita el kit de la URL', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
    const item = candidate('2 x 16 GB');
    item.prices[0].url = 'https://goldentechstore.com.ar/producto/corsair-vengeance-32gb-ddr5-6000mhz-cl30-2-x-16gb-o-4%ZZx%ZZ8gb-negro-rgb/';
    expect(() => resolveGuideComponent(specFor('2 x 16 GB'), [item])).not.toThrow();
    expect(resolveGuideComponent(specFor('2 x 16 GB'), [item]).offers).toEqual([]);
    expect(resolveGuideRefreshOffers(specFor('2 x 16 GB'), [item])).toEqual([]);
  });

  it('conserva una URL con ID que omite el kit sin completar la composición del producto', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
    const item = candidate('2 x 16 GB');
    item.prices[0].storeId = 'shop';
    item.prices[0].storeName = 'Shop';
    item.prices[0].url = 'https://shop.test/188718';
    expect(resolveGuideComponent(specFor('2 x 16 GB'), [item])).toMatchObject({ priceSource: 'catalog', productId: item.id });
    expect(resolveGuideRefreshOffers(specFor('2 x 16 GB'), [item])).toHaveLength(1);
  });

  it.each([
    ['DDR5', 'DDR4'], ['6000MHz', '5600MHz'], ['CL30', 'CL36'], ['CL30', 'CL30 CL36'],
    ['RGB', 'sin iluminación'], ['Negro', 'Blanco'], ['UDIMM', 'SODIMM'], ['VENGEANCE', 'DOMINATOR'],
  ] as [string, string][])('conserva el rechazo de %s cambiado a %s', (from, to) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
    const item = candidate('2 x 16 GB', [from, to]);
    expect(resolveGuideComponent(specFor('2 x16GB'), [item]).offers).toEqual([]);
    expect(resolveGuideRefreshOffers(specFor('2 x16GB'), [item])).toEqual([]);
  });

  it('no habilita una oferta vencida ni una identidad pendiente', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T13:17:00Z'));
    const item = candidate('2 x 16GB');
    item.prices[0].lastUpdated = new Date('2026-10-11T09:17:00Z');
    expect(resolveGuideComponent(specFor('2x16GB'), [item]).offers).toEqual([]);
    expect(item.prices[0].lastUpdated.toISOString()).toBe('2026-10-11T09:17:00.000Z');
    item.prices[0].lastUpdated = new Date('2026-10-11T13:15:50.661Z');
    item.prices[0].identityReview = { version: 1, status: 'needs-review', reason: 'explicit-conflict',
      reviewedAt: null, confidence: null, model: null, subject: { name: item.name, category: item.category, url: item.prices[0].url } };
    expect(resolveGuideComponent(specFor('2x16GB'), [item]).offers).toEqual([]);
    expect(resolveGuideRefreshOffers(specFor('2x16GB'), [item])).toEqual([]);
  });

  it('el parser conserva ausencia y diferencia entre kit repetido y ambiguo', () => {
    expect(readGuideRamKit('32GB')).toEqual({ state: 'none' });
    expect(readGuideRamKit('2x16GB / 2 x 16 GB')).toEqual({ state: 'value', modules: 2, moduleCapacityGb: 16 });
    expect(readGuideRamKit('2x16GB / 4x8GB')).toEqual({ state: 'ambiguous' });
  });
});
