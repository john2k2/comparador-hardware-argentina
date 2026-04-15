import { describe, expect, it } from 'vitest';
import {
  BRANDS,
  extractBrandFromName,
  isKnownBrand,
} from '../scrapers/brand-utils';

describe('brand-utils', () => {
  describe('BRANDS', () => {
    it('contiene las marcas principales', () => {
      expect(BRANDS).toContain('AMD');
      expect(BRANDS).toContain('Intel');
      expect(BRANDS).toContain('ASUS');
      expect(BRANDS).toContain('Gigabyte');
      expect(BRANDS).toContain('MSI');
      expect(BRANDS).toContain('Corsair');
      expect(BRANDS).toContain('NVIDIA');
    });
  });

  describe('extractBrandFromName', () => {
    it('detecta AMD en el nombre', () => {
      expect(extractBrandFromName('AMD Ryzen 7 5800X')).toBe('AMD');
      expect(extractBrandFromName('Procesador AMD Ryzen 5 5600X')).toBe('AMD');
    });

    it('detecta Intel en el nombre', () => {
      expect(extractBrandFromName('Intel Core i7-14700K')).toBe('Intel');
      expect(extractBrandFromName('Procesador Intel i5-13400F')).toBe('Intel');
    });

    it('detecta ASUS en el nombre', () => {
      expect(extractBrandFromName('ASUS ROG Strix RTX 4060')).toBe('ASUS');
      expect(extractBrandFromName('Placa Mother ASUS Prime B650M')).toBe('ASUS');
    });

    it('detecta Gigabyte en el nombre', () => {
      expect(extractBrandFromName('Gigabyte Aorus RTX 4070')).toBe('Gigabyte');
      expect(extractBrandFromName('Mother Gigabyte B550M DS3H')).toBe('Gigabyte');
    });

    it('detecta MSI en el nombre', () => {
      expect(extractBrandFromName('MSI Gaming X Trio RTX 4080')).toBe('MSI');
      expect(extractBrandFromName('MSI MAG B650 Tomahawk')).toBe('MSI');
    });

    it('detecta Corsair en el nombre', () => {
      expect(extractBrandFromName('Corsair Vengeance DDR5 32GB')).toBe('Corsair');
      expect(extractBrandFromName('Fuente Corsair RM850x')).toBe('Corsair');
    });

    it('detecta NVIDIA y mapea GEFORCE a NVIDIA', () => {
      expect(extractBrandFromName('NVIDIA GeForce RTX 4090')).toBe('NVIDIA');
      expect(extractBrandFromName('GeForce RTX 4060 Ti')).toBe('NVIDIA');
    });

    it('detecta RADEON y lo mapea a AMD Radeon', () => {
      // 'AMD Radeon RX 7900 XTX' matchea 'AMD' primero porque AMD esta antes en BRANDS
      expect(extractBrandFromName('AMD Radeon RX 7900 XTX')).toBe('AMD');
      // 'Radeon RX 7600' sin 'AMD' matchea RADEON
      expect(extractBrandFromName('Radeon RX 7600')).toBe('AMD Radeon');
    });

    it('retorna null si no encuentra marca', () => {
      expect(extractBrandFromName('Producto generico sin marca')).toBeNull();
      expect(extractBrandFromName('')).toBeNull();
      expect(extractBrandFromName('ABC123 XYZ')).toBeNull();
    });

    it('es case-insensitive', () => {
      expect(extractBrandFromName('asus rog strix')).toBe('ASUS');
      expect(extractBrandFromName('intel core i9')).toBe('Intel');
      expect(extractBrandFromName('msi gaming')).toBe('MSI');
    });
  });

  describe('isKnownBrand', () => {
    it('reconoce marcas conocidas', () => {
      expect(isKnownBrand('AMD')).toBe(true);
      expect(isKnownBrand('intel')).toBe(true);
      expect(isKnownBrand('ASUS')).toBe(true);
      expect(isKnownBrand('gigabyte')).toBe(true);
      expect(isKnownBrand('msi')).toBe(true);
      expect(isKnownBrand('corsair')).toBe(true);
      expect(isKnownBrand('nvidia')).toBe(true);
    });

    it('rechaza marcas desconocidas', () => {
      expect(isKnownBrand('generico')).toBe(false);
      expect(isKnownBrand('')).toBe(false);
      expect(isKnownBrand('xyz123')).toBe(false);
    });

    it('es case-insensitive', () => {
      expect(isKnownBrand('amd')).toBe(true);
      expect(isKnownBrand('Amd')).toBe(true);
      expect(isKnownBrand('AMD')).toBe(true);
    });
  });
});
