import { describe, expect, it } from 'vitest';
import { isOfferFresh, OFFER_FRESH_MS } from './price-freshness';

describe('isOfferFresh', () => {
  const now = Date.parse('2026-09-23T12:00:00.000Z');

  it('accepts an observation at the three-hour limit but rejects an older one', () => {
    expect(isOfferFresh(new Date(now - OFFER_FRESH_MS), now)).toBe(true);
    expect(isOfferFresh(new Date(now - OFFER_FRESH_MS - 1), now)).toBe(false);
  });

  it('rejects unknown dates and observations implausibly in the future', () => {
    expect(isOfferFresh(null, now)).toBe(false);
    expect(isOfferFresh('invalid', now)).toBe(false);
    expect(isOfferFresh(new Date(0), now)).toBe(false);
    expect(isOfferFresh(new Date(now + 60_001), now)).toBe(false);
  });
});
