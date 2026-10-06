import { expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { guardCategoryPage } from './category-page-guard';
const product = (name: string, category: Product['category'] = 'procesadores') => ({ name, category } as Product);
it('apart category mistakes without changing or silently inventing SQL totals', () => {
  const original = [product('AMD Ryzen 5 7600'), product('PEN DRIVE ULTRA SHIFT 64GB SANDISK'),
    product('Mini PC Intel N100 16GB'), product('Cooler CPU ID-Cooling AM5')];
  expect(guardCategoryPage(original, 'procesadores')).toEqual({ products: [original[0]], excluded: 3 });
  expect(original[1].category).toBe('procesadores');
});
it('separates network switches and drive brackets from PCs and drives', () => {
  expect(guardCategoryPage([product('Switch TP-Link TL-SG1005D', 'computadoras')], 'computadoras').excluded).toBe(1);
  expect(guardCategoryPage([product('Bracket Dell disco 2.5 para notebook', 'almacenamiento')], 'almacenamiento').excluded).toBe(1);
  expect(guardCategoryPage([product('CPU COOLERMASTER HYPER 212 3DHP BLACK ARGB')], 'procesadores').excluded).toBe(1);
  expect(guardCategoryPage([product('DELL SOPORTE PARA DISCO 2.5 SERVER T160', 'almacenamiento')], 'almacenamiento').excluded).toBe(1);
});
it('keeps uncertain products and corrects unfiltered presentation without writes', () => {
  const unknown = product('Modelo 123');
  expect(guardCategoryPage([unknown], 'procesadores')).toEqual({ products: [unknown], excluded: 0 });
  expect(guardCategoryPage([product('Pen Drive 64GB')]).products[0].category).toBe('almacenamiento');
});
