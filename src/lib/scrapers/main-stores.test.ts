import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { HardwareCategory } from '@/lib/types';

// Mock fetch para todos los scrapers
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('scrapers principales (compragamer, fullh4rd, venex)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('compragamer scraper', () => {
    it('importa correctamente', async () => {
      const { fetchCompraGamerProducts } = await import('./compragamer');
      expect(typeof fetchCompraGamerProducts).toBe('function');
    });

    it('retorna array vacio cuando no hay resultados', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [] }),
      });

      const { fetchCompraGamerProducts } = await import('./compragamer');
      const result = await fetchCompraGamerProducts('query-inexistente-xyz', 'procesadores' as HardwareCategory);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('fullh4rd scraper', () => {
    it('importa correctamente', async () => {
      const { fetchFullh4rdProducts } = await import('./fullh4rd');
      expect(typeof fetchFullh4rdProducts).toBe('function');
    });

    it('maneja error de fetch gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { fetchFullh4rdProducts } = await import('./fullh4rd');
      const result = await fetchFullh4rdProducts('test', 'procesadores' as HardwareCategory);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });

  describe('venex scraper', () => {
    it('importa correctamente', async () => {
      const { scrapeVenexProducts } = await import('./venex');
      expect(typeof scrapeVenexProducts).toBe('function');
    });

    it('importa fetchVenexProducts como alias', async () => {
      const { fetchVenexProducts } = await import('./venex');
      expect(typeof fetchVenexProducts).toBe('function');
    });
  });
});
