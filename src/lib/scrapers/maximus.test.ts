import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchMaximusProducts } from './maximus';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('maximus scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchMaximusProducts', () => {
    it('returns empty array on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await fetchMaximusProducts('rtx', 'tarjetas-graficas');
      expect(result).toEqual([]);
    });

    it('returns empty array when no products found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<html></html>',
      }));

      const result = await fetchMaximusProducts('empty', 'procesadores');
      expect(result).toEqual([]);
    });
  });
});