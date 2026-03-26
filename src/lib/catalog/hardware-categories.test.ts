import { describe, expect, it } from 'vitest';
import {
  hardwareCategoryToSearchTerm,
  inferDetailHardwareCategory,
  inferHardwareCategoryFromName,
  isHardwareCategory,
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
  });

  it('infers detail categories more defensively', () => {
    expect(inferDetailHardwareCategory('unknown-rtx-5070')).toBe('tarjetas-graficas');
    expect(inferDetailHardwareCategory('intel-core-i7-14700k')).toBe('procesadores');
    expect(inferDetailHardwareCategory('ssd-nvme-2tb')).toBe('almacenamiento');
  });

  it('maps categories to default search terms', () => {
    expect(hardwareCategoryToSearchTerm('motherboards')).toBe('motherboard');
    expect(hardwareCategoryToSearchTerm('perifericos')).toBe('perifericos');
  });
});
