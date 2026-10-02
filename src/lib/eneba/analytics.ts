import { trackEvent } from '@/lib/analytics';
import { firstEventInNavigation } from '@/lib/analytics/navigation-events';
import { ENEBA_PILOT_CAMPAIGN, isEnebaOfferFresh, type EnebaGameOffer } from './pilot';

function canMeasure(): boolean {
  if (typeof window === 'undefined' || window.__chaAnalyticsAllowed !== true || typeof window.gtag !== 'function') return false;
  return /^G-[A-Z0-9]+$/.test(window.__chaAnalyticsMeasurementId ?? process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? '');
}

/** Vista consentida de la selección resuelta, nunca una impresión publicitaria. */
export function trackEnebaPilotView(status: 'ready' | 'empty' | 'error', offerCount: number): void {
  if (!canMeasure() || !firstEventInNavigation('eneba-pilot-view')) return;
  trackEvent('affiliate_pilot_view', { affiliate_partner: 'eneba', affiliate_campaign: ENEBA_PILOT_CAMPAIGN,
    pilot_status: status, offer_count: offerCount, affiliate_surface: 'digital_games' });
}

/** Un clic explícito no acredita una compra, ni renueva la fecha del precio. */
export function trackEnebaClick(offer: EnebaGameOffer, position: number): void {
  if (!canMeasure() || !isEnebaOfferFresh(offer)) return;
  trackEvent('affiliate_outbound_click', { affiliate_partner: 'eneba', affiliate_campaign: ENEBA_PILOT_CAMPAIGN,
    affiliate_product_id: offer.id, affiliate_platform: offer.platform, affiliate_surface: 'digital_games',
    cta_id: `eneba-game-${offer.id}`, destination_host: new URL(offer.url).hostname, offer_position: position,
    currency: 'ARS', observed_price: offer.price });
}
