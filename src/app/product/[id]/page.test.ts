import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  permanentRedirectMock,
  readCanonicalProductIdByKeyMock,
  readProductByIdFromDatabaseMock,
} = vi.hoisted(() => ({
  permanentRedirectMock: vi.fn((url: string) => {
    throw new Error(`PERMANENT_REDIRECT:${url}`);
  }),
  readCanonicalProductIdByKeyMock: vi.fn(),
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
  readProductByIdFromDatabase: readProductByIdFromDatabaseMock,
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
  });

  it('uses a permanent redirect for duplicate product URLs', async () => {
    await expect(ProductDetailPage({
      params: Promise.resolve({ id: 'store-product' }),
    })).rejects.toThrow('PERMANENT_REDIRECT:/product/group%3Acanonical-product');

    expect(permanentRedirectMock).toHaveBeenCalledWith('/product/group%3Acanonical-product');
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
