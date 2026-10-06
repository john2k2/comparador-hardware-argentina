import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPopularProductsFromDatabase } from '@/lib/persistence/product-read';
import { PopularProductsSection } from './PopularProductsSection';

vi.mock('@/lib/persistence/product-read', () => ({ readPopularProductsFromDatabase: vi.fn() }));

describe('PopularProductsSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('una demora del bloque opcional no rompe la portada ni inventa productos', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(readPopularProductsFromDatabase).mockRejectedValueOnce(new Error('statement timeout'));
    try {
      await expect(PopularProductsSection()).resolves.toBeNull();
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });
});
