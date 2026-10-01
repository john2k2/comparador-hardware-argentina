import { describe, expect, it } from 'vitest';
import {
  hardwareCategoryToSearchTerm,
  inferDetailHardwareCategory,
  inferHardwareCategoryFromName,
  isHardwareCategory,
  resolveHardwareCategoryForProduct,
} from '@/lib/catalog/hardware-categories';

describe('hardware-categories', () => {
  it('validates allowed categories', () => {
    expect(isHardwareCategory('procesadores')).toBe(true);
    expect(isHardwareCategory('tarjetas-graficas')).toBe(true);
    expect(isHardwareCategory('notebooks')).toBe(false);
    expect(isHardwareCategory(null)).toBe(false);
  });

  it('infers categories from search names', () => {
    expect(inferHardwareCategoryFromName('AMD Ryzen 7 7800X3D')).toBe('procesadores');
    expect(inferHardwareCategoryFromName('NVIDIA GeForce RTX 5070')).toBe('tarjetas-graficas');
    expect(inferHardwareCategoryFromName('Gigabyte RX 7600 Gaming 8GB')).toBe('tarjetas-graficas');
    expect(inferHardwareCategoryFromName('MSI GTX 1660 Super 6GB')).toBe('tarjetas-graficas');
    expect(inferHardwareCategoryFromName('Kit 32GB DDR5 RAM')).toBe('memoria-ram');
    expect(inferHardwareCategoryFromName('Kit Mother ASUS B850 + Procesador Ryzen 5 9600X')).toBe('computadoras');
    expect(inferHardwareCategoryFromName('5600x')).toBeUndefined();
    expect(inferHardwareCategoryFromName('producto sin categoria')).toBeUndefined();
    expect(inferHardwareCategoryFromName('Cooler DeepCool AG400')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Watercooler DeepCool LS520')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Water Cooler DeepCool LS520')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Refrigeración líquida DeepCool LE520')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Ventilador para gabinete 120mm')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Disipador CPU DeepCool AG400')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Cooler Master Hyper 212')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Cooler Master MasterLiquid ML240')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Cooler Master ML240 ARGB')).toBe('refrigeracion');
    expect(inferHardwareCategoryFromName('Cooler Master')).toBeUndefined();
    expect(inferHardwareCategoryFromName('AMD Ryzen 5 7600 + Wraith Stealth Cooler')).toBe('procesadores');
    expect(inferHardwareCategoryFromName('Fuente Cooler Master MWE Gold 850W')).toBe('fuentes-alimentacion');
    expect(inferHardwareCategoryFromName('Gabinete Cooler Master TD500')).toBe('gabinetes');
    expect(inferHardwareCategoryFromName('PC Armada Gamer AMD Ryzen 7 7800X3D RTX 5070')).toBe('computadoras');
    expect(inferHardwareCategoryFromName('PC Creadores Intel Core Ultra 7 RTX 4070')).toBe('computadoras');
    expect(inferHardwareCategoryFromName(
      'PC AMD Ryzen 5 3400G 16GB RAM 512GB SSD wifi Gabinete RGB 650W Monitor 20"',
    )).toBe('computadoras');
  });

  it('infers detail categories more defensively', () => {
    expect(inferDetailHardwareCategory('unknown-rtx-5070')).toBe('tarjetas-graficas');
    expect(inferDetailHardwareCategory('intel-core-i7-14700k')).toBe('procesadores');
    expect(inferDetailHardwareCategory('ssd-nvme-2tb')).toBe('almacenamiento');
    expect(inferDetailHardwareCategory('pc-completa-ryzen-5-rtx-4060')).toBe('computadoras');
    expect(inferDetailHardwareCategory('cooler-master-hyper-212')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('cooler-master-masterliquid-ml240')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('cooler-master-ml240')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('watercooler-deepcool-ls520')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('water-cooler-deepcool-ls520')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('refrigeracion-liquida-deepcool-le520')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('ventilador-gabinete-120mm')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('disipador-cpu-deepcool-ag400')).toBe('refrigeracion');
    expect(inferDetailHardwareCategory('amd-ryzen-5-7600-wraith-cooler')).toBe('procesadores');
    expect(inferDetailHardwareCategory('fuente-cooler-master-mwe-850w')).toBe('fuentes-alimentacion');
    expect(inferDetailHardwareCategory('gabinete-cooler-master-td500')).toBe('gabinetes');
  });

  it('prefers strong evidence from the product name over a scraper search category', () => {
    expect(resolveHardwareCategoryForProduct('AMD Ryzen 5 5600X', 'tarjetas-graficas')).toBe('procesadores');
    expect(resolveHardwareCategoryForProduct('Producto 5600X', 'procesadores')).toBe('procesadores');
    expect(resolveHardwareCategoryForProduct('AMD Ryzen 5 5600X')).toBe('procesadores');
    expect(resolveHardwareCategoryForProduct('GeForce RTX 4060')).toBe('tarjetas-graficas');
    expect(resolveHardwareCategoryForProduct('Cooler Master Hyper 212', 'procesadores')).toBe('refrigeracion');
    expect(resolveHardwareCategoryForProduct('Cooler Master MasterLiquid ML240', 'tarjetas-graficas')).toBe('refrigeracion');
    expect(resolveHardwareCategoryForProduct('AMD Ryzen 5 7600 + Wraith Stealth Cooler', 'refrigeracion')).toBe('procesadores');
    expect(resolveHardwareCategoryForProduct('Fuente Cooler Master MWE Gold 850W', 'refrigeracion')).toBe('fuentes-alimentacion');
    expect(resolveHardwareCategoryForProduct('Gabinete Cooler Master TD500', 'refrigeracion')).toBe('gabinetes');
  });

  it.each(['Cooler CPU ID-Cooling SE-224-XTS compatible AMD Ryzen AM4 AM5', 'Watercooler Corsair TITAN 240 RX RGB'])('clasifica el accesorio %s por su función, no por la compatibilidad', (name) => {
    expect(inferHardwareCategoryFromName(name)).toBe('refrigeracion');
    expect(inferDetailHardwareCategory(name)).toBe('refrigeracion');
    expect(resolveHardwareCategoryForProduct(name, 'procesadores')).toBe('refrigeracion');
  });

  it.each([
    ['Gabinete Thermaltake V200 Ryzen Edition', 'gabinetes'],
    ['Mother Asrock A320M-HDV Ryzen M-ATX', 'motherboards'],
    ['Memoria DDR4 compatible Ryzen', 'memoria-ram'],
    ['Fuente Cooler Master 650W compatible Ryzen', 'fuentes-alimentacion'],
  ] as const)('conserva la función principal de %s', (name, category) => {
    expect(inferHardwareCategoryFromName(name)).toBe(category);
    expect(inferDetailHardwareCategory(name)).toBe(category);
    expect(resolveHardwareCategoryForProduct(name, 'procesadores')).toBe(category);
  });

  it('maps categories to default search terms', () => {
    expect(hardwareCategoryToSearchTerm('motherboards')).toBe('motherboard');
    expect(hardwareCategoryToSearchTerm('perifericos')).toBe('perifericos');
  });
});

it.each([
  ['Micro AMD Ryzen 5 5600GT - 6 Núcleos / 12 Threads + Radeon AM4', 'procesadores'],
  ['Procesador AMD Ryzen 3 3200G + Radeon Vega 8 + Cooler', 'procesadores'],
  ['CPU Cooler Intel Performance S1700 (solo para PC armada)', 'refrigeracion'],
  ['Memoria RAM para notebook DDR5 16GB', 'memoria-ram'],
  ['Mouse Ryzen Edition', 'perifericos'],
  ['Micro SD Kingston 128GB', 'almacenamiento'],
  ['Procesadores Core i5 10400 (PARA PC ARMADA)', 'procesadores'],
] as const)('conserva el tipo real aunque %s mencione otros componentes', (name, category) => {
  expect(inferHardwareCategoryFromName(name)).toBe(category);
  expect(inferDetailHardwareCategory(name)).toBe(category);
  if (category) expect(resolveHardwareCategoryForProduct(name, 'computadoras')).toBe(category);
});
