import { describe, expect, it } from 'vitest';
import type { OfferIdentityReview, IdentityEvidence } from './offer-identity';
import {
  buildIdentityEvidence,
  hasExplicitIdentityConflict,
  needsIdentityReview,
  readIdentityReview,
} from './offer-identity';

function identityReview(overrides: Partial<OfferIdentityReview> = {}): OfferIdentityReview {
  return {
    version: 1,
    status: 'consistent',
    reason: 'consistent-text',
    reviewedAt: '2026-09-21T12:00:00.000Z',
    model: 'jev-1.13.0',
    confidence: 0.94,
    subject: { name: 'amd ryzen 7 7800x3d', category: 'procesadores', url: 'https://store.example/amd-ryzen-7-7800x3d' },
    ...overrides,
  };
}

describe('offer identity evidence', () => {
  it('does not treat CPU base and boost clock differences as identity conflicts', () => {
    const evidence: IdentityEvidence = {
      name: 'AMD Ryzen 7 7800X3D 4.2 GHz base 5.0 GHz boost',
      category: 'procesadores',
      offerText: 'amd ryzen 7 7800x3d 4 2 ghz 5 0 ghz',
    };

    expect(hasExplicitIdentityConflict(evidence)).toBe(false);
  });

  it('detects explicit GPU chip and RAM timing conflicts while allowing omitted details', () => {
    expect(hasExplicitIdentityConflict({ name: 'AMD Ryzen 5 5600', category: 'procesadores', offerText: 'AMD Ryzen 5600' })).toBe(false);
    expect(hasExplicitIdentityConflict({ name: 'AMD Ryzen 5 5600', category: 'procesadores', offerText: 'AMD Ryzen 7 5600' })).toBe(true);
    expect(hasExplicitIdentityConflict({
      name: 'NVIDIA GeForce RTX 4060 8GB', category: 'tarjetas-graficas', offerText: 'nvidia geforce rtx 5060 8gb',
    })).toBe(true);
    expect(hasExplicitIdentityConflict({
      name: 'Kingston Fury 32GB DDR5 6000 CL30', category: 'memoria-ram', offerText: 'kingston fury 32gb ddr5 6000 cl36',
    })).toBe(true);
    expect(hasExplicitIdentityConflict({
      name: 'Kingston Fury 32GB DDR5 6000 CL30', category: 'memoria-ram', offerText: 'kingston fury 32gb ddr5 6000',
    })).toBe(false);
  });

  it('keeps only public URL path text and rejects credentials or secret-like evidence', () => {
    const evidence = buildIdentityEvidence(
      'AMD Ryzen 7 7800X3D',
      'procesadores',
      'https://store.example/amd-ryzen-7-7800x3d?token=private-test-key#tracking',
    );

    expect(evidence).toEqual({
      name: 'AMD Ryzen 7 7800X3D',
      category: 'procesadores',
      offerText: 'amd ryzen 7 7800x3d',
    });
    expect(buildIdentityEvidence('AMD Ryzen 7 7800X3D', 'procesadores', 'https://user:password@store.example/amd-ryzen-7-7800x3d')).toBeNull();
    expect(buildIdentityEvidence('Bearer private-test-key', 'procesadores', 'https://store.example/amd-ryzen-7-7800x3d')).toBeNull();
    expect(buildIdentityEvidence('apikey_abcdefghijklmnopqrstuvwxyz', 'procesadores', 'https://store.example/amd-ryzen-7-7800x3d')).toBeNull();
  });
});

describe('stored offer identity reviews', () => {
  it('accepts a matching review, keeps missing legacy reviews valid, and leaves mismatches pending', () => {
    const product = { name: 'AMD Ryzen 7 7800X3D', category: 'procesadores' };
    const offer = { url: 'https://store.example/amd-ryzen-7-7800x3d', identityReview: identityReview() };

    expect(needsIdentityReview(offer, product)).toBe(false);
    expect(needsIdentityReview({ url: offer.url }, product)).toBe(false);
    expect(needsIdentityReview({ ...offer, url: 'https://store.example/other-offer' }, product)).toBe(true);
    expect(needsIdentityReview({ ...offer, identityReview: identityReview({ subject: { ...offer.identityReview.subject, name: 'amd ryzen 9 7950x3d' } }) }, product)).toBe(true);
    expect(needsIdentityReview({ ...offer, identityReview: identityReview({ subject: { ...offer.identityReview.subject, category: 'tarjetas-graficas' } }) }, product)).toBe(true);
  });

  it('turns damaged or semantically invalid persisted reviews into needs-review', () => {
    const damaged = readIdentityReview({ version: 1, status: 'consistent', reason: 'consistent-text', subject: {} });
    expect(damaged).toMatchObject({ status: 'needs-review', reason: 'invalid-response', model: null, confidence: null });
    expect(needsIdentityReview({
      url: 'https://store.example/amd-ryzen-7-7800x3d',
      identityReview: damaged,
    }, { name: 'AMD Ryzen 7 7800X3D', category: 'procesadores' })).toBe(true);
  });

  it('does not accept a consistent review below the minimum confidence', () => {
    const lowConsistent = readIdentityReview(identityReview({ confidence: 0.79 }));
    expect(lowConsistent).toMatchObject({ status: 'needs-review', reason: 'invalid-response' });

    const lowPending = readIdentityReview(identityReview({
      status: 'needs-review', reason: 'low-confidence', confidence: 0.79,
    }));
    expect(lowPending).toMatchObject({ status: 'needs-review', reason: 'low-confidence', confidence: 0.79 });
  });
});
