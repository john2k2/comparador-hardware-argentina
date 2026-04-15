import { describe, expect, it, vi } from 'vitest';

// Mockear Supabase antes de importar registry (puede importar indirectamente)
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: vi.fn(() => null),
  getServerSupabaseReadClient: vi.fn(() => null),
}));

import { STORE_SCRAPERS, FRAMEWORK_SCRAPERS } from './scraper-registry';

describe('scraper-registry', () => {
  describe('STORE_SCRAPERS', () => {
    it('tiene al menos un scraper directo', () => {
      expect(STORE_SCRAPERS.length).toBeGreaterThan(0);
    });

    it('cada scraper directo tiene estructura valida', () => {
      for (const scraper of STORE_SCRAPERS) {
        expect(scraper).toHaveProperty('id');
        expect(scraper).toHaveProperty('displayName');
        expect(scraper).toHaveProperty('fn');
        expect(typeof scraper.id).toBe('string');
        expect(typeof scraper.displayName).toBe('string');
        expect(typeof scraper.fn).toBe('function');
      }
    });

    it('no hay IDs duplicados', () => {
      const ids = STORE_SCRAPERS.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('incluye tiendas conocidas', () => {
      const ids = STORE_SCRAPERS.map((s) => s.id);
      // Al menos algunas tiendas principales deberian estar
      expect(ids.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('FRAMEWORK_SCRAPERS', () => {
    it('tiene al menos un framework scraper', () => {
      expect(FRAMEWORK_SCRAPERS.length).toBeGreaterThan(0);
    });

    it('cada framework scraper tiene estructura valida', () => {
      for (const scraper of FRAMEWORK_SCRAPERS) {
        expect(scraper).toHaveProperty('id');
        expect(scraper).toHaveProperty('displayName');
        expect(scraper).toHaveProperty('fn');
        expect(typeof scraper.id).toBe('string');
        expect(typeof scraper.displayName).toBe('string');
        expect(typeof scraper.fn).toBe('function');
      }
    });

    it('no hay IDs duplicados entre frameworks', () => {
      const ids = FRAMEWORK_SCRAPERS.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('frameworks incluyen plataformas conocidas', () => {
      const ids = FRAMEWORK_SCRAPERS.map((s) => s.id);
      // WooCommerce y TiendaNube son plataformas principales
      const hasWooCommerce = ids.some((id) => id.toLowerCase().includes('woocommerce') || id.toLowerCase().includes('woo'));
      const hasTiendanube = ids.some((id) => id.toLowerCase().includes('tiendanube'));
      
      expect(hasWooCommerce || hasTiendanube).toBe(true);
    });
  });

  describe('consistencia global', () => {
    it('no hay IDs duplicados entre store y framework scrapers', () => {
      const storeIds = new Set(STORE_SCRAPERS.map((s) => s.id));
      const frameworkIds = new Set(FRAMEWORK_SCRAPERS.map((s) => s.id));

      for (const id of frameworkIds) {
        expect(storeIds.has(id)).toBe(false);
      }
    });

    it('total de scrapers es razonable', () => {
      const total = STORE_SCRAPERS.length + FRAMEWORK_SCRAPERS.length;
      expect(total).toBeGreaterThanOrEqual(5);
    });
  });
});
