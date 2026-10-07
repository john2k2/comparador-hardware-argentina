import { describe, expect, it } from 'vitest';
import type { OfferIdentityReview, IdentityEvidence } from './offer-identity';
import {
  buildIdentityEvidence,
  hasExplicitIdentityConflict,
  needsIdentityReview,
  readIdentityReview,
  bindReviewToSource,
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
    expect(hasExplicitIdentityConflict({
      name: 'Corsair Vengeance RS 16GB DDR4 3200', category: 'memoria-ram', offerText: 'corsair vengeance lpx 16gb ddr4 3200',
    })).toBe(true);
    expect(hasExplicitIdentityConflict({
      name: 'Corsair Vengeance RS 16GB DDR4 3200', category: 'memoria-ram', offerText: 'kingston vengeance rs 16gb ddr4 3200',
    })).toBe(true);
    expect(hasExplicitIdentityConflict({
      name: 'Corsair Vengeance RS 16GB DDR4 3200', category: 'memoria-ram', offerText: 'corsair vengeance rs 32gb ddr4 3200',
    })).toBe(true);
    expect(hasExplicitIdentityConflict({
      name: 'ADATA XPG Lancer 16GB DDR5 6000', category: 'memoria-ram', offerText: 'xpg lancer 16gb ddr5 6000',
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

describe('contradicciones de velocidad RAM sin unidad', () => {
  const storedName = 'MEMORIA RAM 16GB DDR4 3200 KINGSTON FURY BEAST RGB';
  const differentSpeed = 'MEMORIA RAM KINGSTON FURY BEAST 16GB 1X16 3600MHZ CL18 DDR4';
  const conflict = (name: string, offerText: string) => hasExplicitIdentityConflict({ name, offerText, category: 'memoria-ram' });

  it('rechaza la publicación de 3600 MHz frente al nombre literal de G02 y en sentido inverso', () => {
    expect(conflict(storedName, differentSpeed)).toBe(true);
    expect(conflict(differentSpeed, storedName)).toBe(true);
  });

  it('mantiene pendiente una oferta contradictoria aunque conserve una aprobación anterior', () => {
    const url = 'https://store.example/producto/ram';
    const sourceIdentity = { title: differentSpeed, listingRef: 'store:id:10985' };
    const review = identityReview({ sourceIdentity,
      subject: { name: storedName.toLowerCase(), category: 'memoria-ram', url } });
    expect(needsIdentityReview({ url, sourceIdentity, identityReview: review }, {
      name: storedName, category: 'memoria-ram',
    })).toBe(true);
  });

  it.each(['DDR3 1600', 'DDR4 3200', 'DDR5 6000'])('reconoce la velocidad junto a %s sin inventar diferencias por la unidad', (memory) => {
    const name = `Memoria Kingston Fury Beast 16GB ${memory}`;
    expect(conflict(name, `${name}MHz`)).toBe(false);
    expect(conflict(`${name}MHz`, name)).toBe(false);
    expect(conflict(name, name.replace(/\d{4}$/, '7200MHz'))).toBe(true);
  });

  it.each([
    'MEMORIA RAM KINGSTON FURY BEAST 16GB DDR4',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB DDR4 SKU 3600',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB DDR4 modelo 3600',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB DDR4 edición 2026',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB DDR4 2026',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB SKU DDR4 3600',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB modelo: DDR4 3600',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB año DDR4 2000',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB SKU DDR4-3600',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB DDR4 SKU (DDR4 3600)',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB DDR4 MPN: [DDR4 3600]',
    'MEMORIA RAM KINGSTON FURY BEAST 16GB 3600',
  ])('conserva una velocidad omitida o un distractor como desconocidos: %s', (source) => {
    expect(conflict(storedName, source)).toBe(false);
    expect(conflict(source, storedName)).toBe(false);
  });
});

describe('stored offer identity reviews', () => {
  it('invalida una aprobación al cambiar título, SKU, publicación o ID de la fuente', () => {
    const product = { name: 'AMD Ryzen 7 7800X3D', category: 'procesadores' };
    const sourceIdentity = { title: product.name, listingRef: 'store:123', storeSku: 'A', sourceId: '123' };
    const review = identityReview({ sourceIdentity });
    const offer = { url: review.subject.url, identityReview: review, sourceIdentity };
    expect(needsIdentityReview(offer, product)).toBe(false);
    for (const changed of [{ ...sourceIdentity, title: 'AMD Ryzen 9 7950X3D' }, { ...sourceIdentity, storeSku: 'B' },
      { ...sourceIdentity, listingRef: 'store:124' }, { ...sourceIdentity, sourceId: '124' }]) {
      expect(needsIdentityReview({ ...offer, sourceIdentity: changed }, product)).toBe(true);
      expect(bindReviewToSource(review, changed, product, offer.url)).toMatchObject({ status: 'needs-review', reason: 'insufficient-evidence', sourceIdentity: changed });
    }
    expect(bindReviewToSource(review, { ...sourceIdentity, title: ' AMD RYZEN 7 7800X3D ' }, product, offer.url)).toBe(review);
  });
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

it('detecta contradicciones de ensamblador y edición sin inventar detalles omitidos', () => {
  const conflict = (name: string, offerText: string) => hasExplicitIdentityConflict({ name, offerText, category: 'tarjetas-graficas' });
  expect(conflict('ASUS Dual RTX 5060 8GB EVO OC', 'ASUS Dual RTX 5060 8GB ADVANCED OC')).toBe(true);
  expect(conflict('MSI Shadow RTX 5060 8GB 2X OC', 'MSI Shadow RTX 5060 8GB 3X OC')).toBe(true);
  expect(conflict('ASUS Dual RTX 5060 8GB', 'MSI Shadow RTX 5060 8GB')).toBe(true);
  expect(conflict('ASUS Dual RTX 5060 8GB EVO OC', 'ASUS Dual RTX 5060 8GB')).toBe(false);
  expect(conflict('ASUS Dual RTX 5060 8GB White', 'ASUS Dual RTX 5060 8GB Black')).toBe(true);
});
it('no acepta presentación ni refrigeración CPU contradictorias aunque coincida el chip',()=>{
 expect(hasExplicitIdentityConflict({name:'AMD Ryzen 3 4100 con cooler',category:'procesadores',offerText:'AMD Ryzen 3 4100 sin cooler'})).toBe(true);
 expect(hasExplicitIdentityConflict({name:'AMD Ryzen 3 4100 BOX',category:'procesadores',offerText:'AMD Ryzen 3 4100 TRAY'})).toBe(true);
});
