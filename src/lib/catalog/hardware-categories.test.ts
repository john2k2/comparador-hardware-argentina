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
    expect(inferHardwareCategoryFromName('Kit 32GB DDR5 RAM')).toBe('memoria-ram');
    expect(inferHardwareCategoryFromName('Kit Mother ASUS B850 + Procesador Ryzen 5 9600X')).toBe('computadoras');
    expect(inferHardwareCategoryFromName('5600x')).toBeUndefined();
    expect(inferHardwareCategoryFromName('producto sin categoria')).toBeUndefined();
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
  });

  it('prefers strong evidence from the product name over a scraper search category', () => {
    expect(resolveHardwareCategoryForProduct('AMD Ryzen 5 5600X', 'tarjetas-graficas')).toBe('procesadores');
    expect(resolveHardwareCategoryForProduct('Producto 5600X', 'procesadores')).toBe('procesadores');
    expect(resolveHardwareCategoryForProduct('AMD Ryzen 5 5600X')).toBe('procesadores');
    expect(resolveHardwareCategoryForProduct('GeForce RTX 4060')).toBe('tarjetas-graficas');
  });

  it('maps categories to default search terms', () => {
    expect(hardwareCategoryToSearchTerm('motherboards')).toBe('motherboard');
    expect(hardwareCategoryToSearchTerm('perifericos')).toBe('perifericos');
  });
});
