import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as portaltechModule from './portaltech';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const validProductHtml = `
<div class="carta-producto">
  <a href="https://portalstore.com.ar/producto/placa-video-rtx-4080-super">
    <meta itemprop="name" content="Placa de Video RTX 4080 Super" />
    <meta itemprop="brand" content="NVIDIA" />
    <meta itemprop="price" content="1899999" />
    <meta itemprop="image" content="https://portalstore.com.ar/rtx4080.jpg" />
  </a>
  <div class="badge">disponible</div>
  <div class="contenedor-carta-campo-3"><div>$ 1.899.999</div></div>
</div>
<div class="carta-producto">
  <a href="https://portalstore.com.ar/producto/procesador-amd-ryzen-9-7950x">
    <meta itemprop="name" content="Procesador AMD Ryzen 9 7950X" />
    <meta itemprop="brand" content="AMD" />
    <meta itemprop="price" content="899999" />
  </a>
  <div class="badge">stock bajo</div>
  <div class="contenedor-carta-campo-3"><div>$ 899.999</div></div>
</div>
`;

const successResponse = {
  success: true,
  result: validProductHtml,
};

function createMockFetch(response: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
  });
}

describe('portaltech scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPortalTechProducts', () => {
    it('returns empty array for empty query', async () => {
      const result = await portaltechModule.fetchPortalTechProducts('', 'procesadores');
      expect(result).toEqual([]);
    });

    it('returns empty array when Cloudflare credentials not configured', async () => {
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');
      vi.stubEnv('CLOUDFLARE_API_TOKEN', '');

      const result = await portaltechModule.fetchPortalTechProducts('ryzen', 'procesadores');
      expect(result).toEqual([]);
    });

    it('parses products from Cloudflare rendered HTML', async () => {
      vi.stubGlobal('fetch', createMockFetch(successResponse));

      const result = await portaltechModule.fetchPortalTechProducts('rtx', 'tarjetas-graficas');

      expect(result.length).toBeGreaterThan(0);
      const rtxProduct = result.find(p => p.name.includes('RTX 4080'));
      expect(rtxProduct).toBeDefined();
      expect(rtxProduct?.brand).toBe('NVIDIA');
      expect(rtxProduct?.lowestPrice).toBe(1899999);
    });

    it('filters products by category', async () => {
      vi.stubGlobal('fetch', createMockFetch(successResponse));

      const result = await portaltechModule.fetchPortalTechProducts('placa', 'procesadores');

      expect(result.every(p => p.category === 'procesadores')).toBe(true);
    });
  });

  describe('fetchPortalTechCategory', () => {
    it('merges products from multiple search terms', async () => {
      vi.stubGlobal('fetch', createMockFetch(successResponse));

      const result = await portaltechModule.fetchPortalTechCategory('procesadores');

      expect(result.length).toBeGreaterThan(0);
    });

    it('respects the 18 product limit', async () => {
      const manyProductsHtml = Array.from({ length: 20 }, (_, i) => `
        <div class="carta-producto">
          <a href="https://portalstore.com.ar/producto/product-${i}">
            <meta itemprop="name" content="Product ${i}" />
            <meta itemprop="brand" content="Brand" />
            <meta itemprop="price" content="${100000 + i}" />
          </a>
        </div>
      `).join('');

      vi.stubGlobal('fetch', createMockFetch({ success: true, result: manyProductsHtml }));

      const result = await portaltechModule.fetchPortalTechCategory('procesadores');
      expect(result.length).toBeLessThanOrEqual(18);
    });

    it('returns products even on some errors (graceful degradation)', async () => {
      const errorResponse = { success: false, errors: [{ code: 500, message: 'Server error' }] };
      vi.stubGlobal('fetch', createMockFetch(errorResponse));

      const result = await portaltechModule.fetchPortalTechCategory('procesadores');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('fetchPortalTechProductById', () => {
    it('returns null for invalid ID format', async () => {
      const result = await portaltechModule.fetchPortalTechProductById('invalid-id');
      expect(result).toBeNull();
    });

    it('returns null when ID does not start with portaltech-', async () => {
      const result = await portaltechModule.fetchPortalTechProductById('other-store-123');
      expect(result).toBeNull();
    });

    it('returns null for empty slug after portaltech-', async () => {
      const result = await portaltechModule.fetchPortalTechProductById('portaltech-');
      expect(result).toBeNull();
    });

    it('returns null for whitespace-only slug', async () => {
      const result = await portaltechModule.fetchPortalTechProductById('portaltech-   ');
      expect(result).toBeNull();
    });

    it('returns null when product not found or parse fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
      } as Response));

      const result = await portaltechModule.fetchPortalTechProductById('portaltech-placa-video-rtx-4080-super');
      expect(result).toBeNull();
    });
  });
});