import { describe, expect, it } from 'vitest';
import {
  CATALOG_OFFER_FRESH_MS,
  isCatalogOfferFresh,
  isOfferFresh,
  OFFER_FRESH_MS,
} from './price-freshness';

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

describe('isCatalogOfferFresh', () => {
  const now = Date.parse('2026-09-23T12:00:00.000Z');

  it('acepta una observacion en la frontera de 24 horas y rechaza una mas antigua', () => {
    expect(isCatalogOfferFresh(new Date(now - CATALOG_OFFER_FRESH_MS), now)).toBe(true);
    expect(isCatalogOfferFresh(new Date(now - CATALOG_OFFER_FRESH_MS - 1), now)).toBe(false);
  });

  it('acepta ocho horas para catalogo, pero no para guias o armador', () => {
    const observedAt = new Date(now - 8 * 60 * 60 * 1000);

    expect(isCatalogOfferFresh(observedAt, now)).toBe(true);
    expect(isOfferFresh(observedAt, now)).toBe(false);
  });

  it('rechaza observaciones futuras o invalidas', () => {
    expect(isCatalogOfferFresh(new Date(now + 60_001), now)).toBe(false);
    expect(isCatalogOfferFresh(null, now)).toBe(false);
    expect(isCatalogOfferFresh('invalid', now)).toBe(false);
    expect(isCatalogOfferFresh(new Date(0), now)).toBe(false);
  });
});
