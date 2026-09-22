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

  it('tracks one explicit pageview after the analytics loader is ready', async () => {
    const { pageview } = await import('./ga4');

    pageview('/comparar/procesadores?stores=mexx');

    expect(gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
      page_location: '/comparar/procesadores?stores=mexx',
      send_to: 'G-TEST123',
    }));
  });

  it('tracks outbound store clicks with a dedicated commercial event', async () => {
    const { trackStoreClick } = await import('./ga4');

    trackStoreClick({
      productId: 'agrupado-123',
      productName: 'RTX 5070',
      storeName: 'Mexx',
      storeId: 'mexx',
      price: 123456,
      position: 1,
      category: 'tarjetas-graficas',
      ctaId: 'product_store_offer',
      destinationUrl: 'https://mexx.com.ar/producto/rtx-5070',
      surface: 'product_detail',
      linkType: 'sponsored',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'outbound_store_click', expect.objectContaining({
      outbound_surface: 'product_detail',
      outbound_link_type: 'sponsored',
      product_id: 'agrupado-123',
      store_id: 'mexx',
      store_name: 'Mexx',
      store_position: 1,
      product_category: 'tarjetas-graficas',
      cta_id: 'product_store_offer',
      destination_host: 'mexx.com.ar',
    }));
  });

  it('tracks sponsored store slot clicks as promotions', async () => {
    const { trackSponsoredStoreSelection } = await import('./ga4');

    trackSponsoredStoreSelection({
      storeId: 'mexx',
      storeName: 'Mexx',
      position: 2,
      surface: 'home_sponsored',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'select_promotion', expect.objectContaining({
      promotion_id: 'mexx',
      promotion_surface: 'home_sponsored',
      creative_slot: '2',
    }));
  });

  it('tracks commercial contact intent without personal data', async () => {
    const { trackContactIntent } = await import('./ga4');

    trackContactIntent({
      purpose: 'commercial',
      channel: 'email',
      surface: 'contact_page',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', expect.objectContaining({
      lead_type: 'commercial',
      contact_channel: 'email',
      contact_surface: 'contact_page',
      send_to: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
    }));
  });

  it('tracks the advisory funnel without personal data', async () => {
    const { trackAdvisoryCta, trackBudgetBuilder, trackContactIntent } = await import('./ga4');

    trackBudgetBuilder({ source: 'preset', budget: 1_500_000 });
    trackAdvisoryCta({ surface: 'budget_builder', ctaId: 'request_pc_advisory' });
    trackContactIntent({
      purpose: 'pc_advisory',
      channel: 'email',
      surface: 'contact_page',
      ctaId: 'contact_pc_advisory_email',
    });

    expect(gtag).toHaveBeenNthCalledWith(1, 'event', 'generate_pc_budget', expect.objectContaining({
      value: 1_500_000,
      budget_source: 'preset',
    }));
    expect(gtag).toHaveBeenNthCalledWith(2, 'event', 'select_advisory_cta', expect.objectContaining({
      service_type: 'pc_advisory',
      cta_surface: 'budget_builder',
    }));
    expect(gtag).toHaveBeenNthCalledWith(3, 'event', 'generate_lead', expect.objectContaining({
      lead_type: 'pc_advisory',
      cta_id: 'contact_pc_advisory_email',
    }));
  });

  it('tracks a PC builder action with bounded fields and no free-form payload', async () => {
    const { trackPcBuilderAction } = await import('./ga4');

    trackPcBuilderAction({
      action: 'refresh_result',
      componentCount: 8,
      complete: false,
      slot: 'gpu',
      status: 'partial',
      updatedCount: 3,
    });

    expect(gtag).toHaveBeenCalledWith('event', 'pc_builder_action', {
      builder_action: 'refresh_result',
      selected_components: 8,
      build_complete: false,
      component_slot: 'gpu',
      refresh_status: 'partial',
      updated_offers: 3,
      send_to: 'G-TEST123',
    });
    const payload = gtag.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('url');
    expect(payload).not.toHaveProperty('payload');
    expect(payload).not.toHaveProperty('text');
    expect(payload).not.toHaveProperty('message');
  });

  it('does not throw or emit a PC builder action when GA4 is unavailable', async () => {
    const { trackPcBuilderAction } = await import('./ga4');

    vi.stubGlobal('window', {});
    expect(() => trackPcBuilderAction({ action: 'saved', componentCount: 2, complete: false })).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();

    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', '');
    vi.stubGlobal('window', { gtag });
    const withoutMeasurementId = await import('./ga4');
    expect(() => withoutMeasurementId.trackPcBuilderAction({ action: 'restored', componentCount: 2, complete: false })).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();
  });
});
