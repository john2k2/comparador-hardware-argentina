import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHomeSectionsData } from '@/lib/home/home-sections';
import { PriceDropSection } from './PriceDropSection';
import { logger } from '@/lib/logger';

vi.mock('@/lib/home/home-sections', () => ({ getHomeSectionsData: vi.fn() }));

describe('PriceDropSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un fallo de lectura no rompe la portada ni presenta una baja inventada', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.mocked(getHomeSectionsData).mockRejectedValueOnce(new Error('statement timeout'));
    try {
      await expect(PriceDropSection()).resolves.toBeNull();
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });
});
