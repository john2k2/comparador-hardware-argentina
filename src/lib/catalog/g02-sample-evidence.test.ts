import { describe, expect, it } from 'vitest';
import { measureG02Sample } from './g02-sample-evidence';
import { normalizeIdentityText } from '@/lib/product-identity';

const now = '2026-09-29T17:30:00Z';
const product = { id: 'gpu-evo', name: 'ASUS Dual RTX 5060 8GB EVO OC', category: 'tarjetas-graficas' as const };
const url = 'https://store.example/asus-dual-rtx-5060-8gb-evo-oc';
const review = { version: 1, status: 'consistent', reason: 'consistent-text', model: 'jev-1.13.0', confidence: 0.95,
  reviewedAt: now, subject: { name: normalizeIdentityText(product.name), category: product.category, url },
  sourceIdentity: { listingRef: 'store:123', title: product.name } };
const price = { product_id: product.id, url, stock: 'in-stock', price: 100,
  last_updated: now, identity_review: review };

describe('evidencia de identidad de la muestra fija G02', () => {
  it('separa disponibilidad y frescura de una revisión realmente aplicable a la ficha', () => {
    const rows = [price,
      { ...price, identity_review: undefined },
      { ...price, identity_review: { ...review, subject: { ...review.subject, name: 'otro producto' } } },
      { ...price, identity_review: { ...review, confidence: 0.5 } },
      { ...price, identity_review: { ...review, sourceIdentity: { ...review.sourceIdentity, title: 'ASUS Dual RTX 5060 8GB ADVANCED OC' } } },
    ];
    expect(measureG02Sample([product], rows, now)).toMatchObject({
      denominator: 5, fresh3h: 5, candidateComparable3h: 5,
      identityAccepted3h: 1, identityUnverified3h: 4, explicitConflicts3h: 1, productsWithAcceptedOffer3h: 1,
    });
  });
  it('no renueva la observación con una revisión nueva ni oculta fichas sin cobertura', () => {
    const other = { ...product, id: 'other' };
    expect(measureG02Sample([product, other], [{ ...price, last_updated: '2026-09-28T12:00:00Z' }], now)).toMatchObject({
      denominator: 1, fresh24h: 0, identityAccepted3h: 0, productsWithoutAcceptedOffer3h: ['gpu-evo', 'other'],
    });
  });
  it('ignora precios no comprables y fechas futuras sin tratar ausencia como stock agotado', () => {
    expect(measureG02Sample([product], [
      { ...price, stock: 'unknown' }, { ...price, stock: 'out-of-stock' }, { ...price, price: 0 },
      { ...price, last_updated: '2026-09-29T18:00:00Z' },
    ], now)).toMatchObject({ denominator: 1, fresh3h: 0, identityAccepted3h: 0 });
  });
  it('rechaza metadatos dañados sin romper la lectura', () => {
    expect(measureG02Sample([product], [{ ...price, identity_review: { ...review, sourceIdentity: { title: 42 } } }], now))
      .toMatchObject({ identityAccepted3h: 0, identityUnverified3h: 1 });
  });
  it('usa el título actual y no permite que un dictamen viejo acredite otra variante', () => {
    expect(measureG02Sample([product], [{ ...price, source_identity: { title: 'ASUS Dual RTX 5060 Ti 16GB OC', listingRef: 'store:123' } }], now))
      .toMatchObject({ identityAccepted3h: 0, identityUnverified3h: 1, explicitConflicts3h: 1 });
  });
  it('un título observado inválido o un host ajeno no acreditan identidad', () => {
    expect(measureG02Sample([product], [{ ...price, source_identity: { title: 42, listingRef: 'store:123' } }], now))
      .toMatchObject({ identityAccepted3h: 0, identityUnverified3h: 1 });
    expect(measureG02Sample([product], [{ ...price, store_id: 'mexx' }], now))
      .toMatchObject({ identityAccepted3h: 0, identityUnverified3h: 1 });
  });
});
