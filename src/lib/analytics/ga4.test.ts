import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ga4 analytics helpers', () => {
  const gtag = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'G-TEST123');
    vi.stubGlobal('window', { gtag });
    gtag.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('tracks product selection with surface and position context', async () => {
    const { trackProductSelection } = await import('./ga4');

    trackProductSelection({
      productId: 'agrupado-123',
      productName: 'RTX 5070',
      category: 'tarjetas-graficas',
      brand: 'nvidia',
      price: 123456,
      position: 3,
      surface: 'search_results',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'select_item', expect.objectContaining({
      selection_surface: 'search_results',
      items: [
        expect.objectContaining({
          item_id: 'agrupado-123',
          index: 3,
          item_list_name: 'search_results',
        }),
      ],
    }));
  });

  it('tracks outbound store clicks with link type and surface', async () => {
    const { trackStoreClick } = await import('./ga4');

    trackStoreClick({
      productId: 'agrupado-123',
      productName: 'RTX 5070',
      storeName: 'Mexx',
      storeId: 'mexx',
      price: 123456,
      position: 1,
      surface: 'product_detail',
      linkType: 'sponsored',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'select_item', expect.objectContaining({
      outbound_surface: 'product_detail',
      outbound_link_type: 'sponsored',
      items: [
        expect.objectContaining({
          promotion_id: 'mexx',
          creative_slot: '1',
        }),
      ],
    }));
  });
});
