import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  notFound: vi.fn(),
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
});
