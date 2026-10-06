import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEBA_AFFILIATE_ID, ENEBA_REVIEWED_GAMES, ENEBA_PILOT_CAMPAIGN } from './pilot';

const now = new Date('2026-10-02T18:00:00Z');
const offer = { ...ENEBA_REVIEWED_GAMES[0], price: 1234.56, currency: 'ARS' as const,
  observedAt: now.toISOString(), url: `https://www.eneba.com/latam/${ENEBA_REVIEWED_GAMES[0].id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS` };

describe('medición consentida del piloto Eneba', () => {
  const gtag = vi.fn();
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    vi.stubGlobal('window', { gtag, __chaAnalyticsAllowed: true, __chaAnalyticsMeasurementId: 'G-PILOT123',
      location: { href: 'https://test.local/juegos-digitales' } });
    gtag.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('conserva una vista cuando el consentimiento llega después y evita duplicarla', async () => {
    const { trackEnebaPilotView } = await import('./analytics');
    window.__chaAnalyticsAllowed = false;
    trackEnebaPilotView('ready', 2);
    expect(gtag).not.toHaveBeenCalled();
    window.__chaAnalyticsAllowed = true;
    trackEnebaPilotView('ready', 2);
    trackEnebaPilotView('ready', 2);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'affiliate_pilot_view', expect.objectContaining({
      affiliate_campaign: ENEBA_PILOT_CAMPAIGN, offer_count: 2, pilot_status: 'ready' }));
  });

  it('mide un clic con juego y campaña sin emitir una venta ni clic de hardware', async () => {
    const { trackEnebaClick } = await import('./analytics');
    trackEnebaClick(offer, 1);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'affiliate_outbound_click', expect.objectContaining({
      affiliate_product_id: offer.id, destination_host: 'www.eneba.com', observed_price: 1234.56 }));
  });

  it('no mide tras retirar consentimiento ni cuando vence el precio', async () => {
    const { trackEnebaClick } = await import('./analytics');
    window.__chaAnalyticsAllowed = false;
    trackEnebaClick(offer, 1);
    window.__chaAnalyticsAllowed = true;
    trackEnebaClick({ ...offer, observedAt: '2026-10-01T18:00:00Z' }, 1);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('separa exposición y navegación interna, y conserva el consentimiento tardío sin duplicar vistas', async () => {
    const { trackEnebaPromotionView, trackEnebaPromotionClick } = await import('./analytics');
    window.__chaAnalyticsAllowed = false;
    trackEnebaPromotionView(); trackEnebaPromotionClick();
    expect(gtag).not.toHaveBeenCalled();
    window.__chaAnalyticsAllowed = true;
    trackEnebaPromotionView(); trackEnebaPromotionView(); trackEnebaPromotionClick();
    expect(gtag).toHaveBeenCalledTimes(2);
    expect(gtag).toHaveBeenNthCalledWith(1, 'event', 'affiliate_promo_view', expect.objectContaining({ affiliate_surface: 'home' }));
    expect(gtag).toHaveBeenNthCalledWith(2, 'event', 'affiliate_promo_click', expect.objectContaining({ cta_id: 'home-eneba-games' }));
    window.__chaAnalyticsAllowed = false;
    trackEnebaPromotionClick();
    expect(gtag).toHaveBeenCalledTimes(2);
  });
});
