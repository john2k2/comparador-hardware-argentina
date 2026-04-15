import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchLoggProducts } from './logg';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const emptyLoggHtml = `<!DOCTYPE html><html><body></body></html>`;

describe('logg scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchLoggProducts', () => {
    it('returns empty array on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await fetchLoggProducts('rtx', 'tarjetas-graficas');
      expect(result).toEqual([]);
    });

    it('returns empty array when no products found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://logg.com.ar/buscar',
        text: async () => emptyLoggHtml,
      }));

      const result = await fetchLoggProducts('empty', 'procesadores');
      expect(result).toEqual([]);
    });
  });
});