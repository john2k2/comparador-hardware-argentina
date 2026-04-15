import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchWiztechProducts } from './wiztech';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('wiztech scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchWiztechProducts', () => {
    it('returns empty array when API returns no products', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ Ok: true, Result: [] }),
      }));

      const result = await fetchWiztechProducts('empty', 'procesadores');
      expect(result).toEqual([]);
    });

    it('filters products by category', async () => {
      const mockApiResponse = {
        Ok: true,
        Result: [
          {
            IdProducto: 12345,
            Marca: 'NVIDIA',
            Componente: 'placa de video',
            Modelo: 'RTX 4080 Super 16GB',
            Precio: 1899999,
            Descripcion: 'Placa de Video RTX 4080 Super 16GB',
            HabilitadoWeb: 1,
            Consultar: false,
          },
          {
            IdProducto: 67890,
            Marca: 'AMD',
            Componente: 'procesador',
            Modelo: 'Ryzen 9 7950X',
            Precio: 899999,
            Descripcion: 'Procesador AMD Ryzen 9 7950X',
            HabilitadoWeb: 1,
            Consultar: false,
          },
        ],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      }));

      const result = await fetchWiztechProducts('rtx', 'tarjetas-graficas');
      expect(result.every(p => p.category === 'tarjetas-graficas')).toBe(true);
    });
  });
});