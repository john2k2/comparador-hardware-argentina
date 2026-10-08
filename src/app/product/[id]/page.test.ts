import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  permanentRedirectMock,
  readCanonicalProductIdByKeyMock,
  readCanonicalProductIdForProductIdMock,
  readProductByIdFromDatabaseMock,
} = vi.hoisted(() => ({
  permanentRedirectMock: vi.fn((url: string) => {
    throw new Error(`PERMANENT_REDIRECT:${url}`);
  }),
  readCanonicalProductIdByKeyMock: vi.fn(),
  readCanonicalProductIdForProductIdMock: vi.fn(),
  readProductByIdFromDatabaseMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
  permanentRedirect: permanentRedirectMock,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/components/product/ProductDetailClient', () => ({
  ProductDetailClient: () => null,
}));

vi.mock('@/lib/persistence/product-read', () => ({
  readCanonicalProductIdByKey: readCanonicalProductIdByKeyMock,
  readCanonicalProductIdForProductId: readCanonicalProductIdForProductIdMock,
  readProductDetailByIdFromDatabase: readProductByIdFromDatabaseMock,
}));

import ProductDetailPage from './page';

describe('product canonical redirects', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    readProductByIdFromDatabaseMock.mockResolvedValue({
      id: 'store-product',
      name: 'Producto individual',
      brand: 'Marca',
      canonicalProductKey: 'canonical-key',
      prices: [],
    });
    readCanonicalProductIdByKeyMock.mockResolvedValue('group:canonical-product');
    readCanonicalProductIdForProductIdMock.mockResolvedValue('group:canonical-product');
  });

  it('uses a permanent redirect for duplicate product URLs', async () => {
    await expect(ProductDetailPage({
      params: Promise.resolve({ id: 'store-product' }),
    })).rejects.toThrow('PERMANENT_REDIRECT:/product/group%3Acanonical-product');

    expect(permanentRedirectMock).toHaveBeenCalledWith('/product/group%3Acanonical-product');
  });

  it('mantiene la publicación elegida desde el comparador y el lector canónico vigente', async () => {
    await expect(ProductDetailPage({
      params: Promise.resolve({ id: 'store-product' }),
      searchParams: Promise.resolve({ from: '/comparativa/comparar?category=procesadores' }),
    })).resolves.toBeTruthy();
    expect(permanentRedirectMock).not.toHaveBeenCalled();
    expect(readProductByIdFromDatabaseMock).toHaveBeenCalledWith('store-product');
    expect(readCanonicalProductIdForProductIdMock).toHaveBeenCalledWith('store-product');
  });

  it('inicia la búsqueda canónica sin esperar el detalle completo', async () => {
    let resolveDetail!: (value: unknown) => void;
    readProductByIdFromDatabaseMock.mockReturnValue(new Promise((resolve) => { resolveDetail = resolve; }));
    const render = ProductDetailPage({ params: Promise.resolve({ id: 'store-product' }) });
    await vi.waitFor(() => expect(readCanonicalProductIdForProductIdMock).toHaveBeenCalledWith('store-product'));
    resolveDetail({ id: 'store-product', name: 'Producto individual', brand: 'Marca', canonicalProductKey: 'canonical-key', prices: [] });
    await expect(render).rejects.toThrow('PERMANENT_REDIRECT:/product/group%3Acanonical-product');
  });

  it('responde 404 sin rechazos sin observar cuando la lectura canónica también falla', async () => {
    readProductByIdFromDatabaseMock.mockResolvedValue(null);
    readCanonicalProductIdForProductIdMock.mockRejectedValue(new Error('canonical unavailable'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await expect(ProductDetailPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NOT_FOUND');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('conserva filtros y página al redirigir al agrupado desde una búsqueda', async () => {
    const from = '/search?q=ryzen&page=2&category=procesadores';
    await expect(ProductDetailPage({
      params: Promise.resolve({ id: 'store-product' }),
      searchParams: Promise.resolve({ from }),
    })).rejects.toThrow(`PERMANENT_REDIRECT:/product/group%3Acanonical-product?${new URLSearchParams({ from })}`);
  });

  it('resolves a search fixture detail locally in stable mode without consulting the database', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    await expect(ProductDetailPage({
      params: Promise.resolve({ id: 'fixture-ryzen-5600' }),
    })).resolves.toBeTruthy();
    expect(readProductByIdFromDatabaseMock).not.toHaveBeenCalled();
    expect(readCanonicalProductIdByKeyMock).not.toHaveBeenCalled();
  });

  it('keeps unknown fixture ids as 404 without consulting the database', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    await expect(ProductDetailPage({
      params: Promise.resolve({ id: 'unknown-fixture' }),
    })).rejects.toThrow('NOT_FOUND');
    expect(readProductByIdFromDatabaseMock).not.toHaveBeenCalled();
  });
});
