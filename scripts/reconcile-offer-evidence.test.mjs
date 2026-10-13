import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileOfferEvidence } from './reconcile-offer-evidence.mjs';

// Fixtures sintéticas; no acreditan observaciones de producción.
function fixture() {
  const subject = { productId: 'ram-test', storeId: 'store-test', url: 'https://example.test/ram/' };
  const row = { ...subject, currency: 'ARS', price: 1202122, stock: 'unknown', priceCondition: 'special',
    capturedAt: '2026-10-13T13:00:00Z', lastUpdated: '2026-10-11T18:49:20.003Z' };
  return { version: 1, asOf: '2026-10-13T13:00:00Z', subject, evidence: [
    { ...row, role: 'producer', price: 1202121.97, stock: 'in-stock', lastUpdated: '2026-10-13T12:12:37.760Z' },
    { ...row, role: 'snapshot' }, { ...row, role: 'public-api' },
  ] };
}

test('distingue productor fresco de copia pública antigua y redondeo de moneda', () => {
  const r = reconcileOfferEvidence(fixture());
  assert.equal(r.status, 'producer-newer-than-public');
  assert.equal(r.evidence[0].fresh3h, true);
  assert.equal(r.evidence[2].fresh24h, false);
  assert.equal(r.producerToPublic.stockMatches, false);
  assert.equal(r.producerToPublic.priceDifferenceARS, 0.03);
  assert.equal(r.producerToPublic.roundedWholePesoMatches, true);
  assert.deepEqual(r.snapshotToPublic, { observationMatches: true, priceMatches: true, stockMatches: true, conditionMatches: true });
});

test('una fecha equivalente con offset conserva la misma observación', () => {
  const f = fixture();
  f.evidence[0].lastUpdated = '2026-10-11T15:49:20.003-03:00';
  assert.equal(reconcileOfferEvidence(f).status, 'same-observation');
});

test('una API más nueva no se diagnostica como recuperación del productor', () => {
  const f = fixture(); f.evidence[2].lastUpdated = '2026-10-13T12:50:00Z';
  assert.equal(reconcileOfferEvidence(f).status, 'public-newer-than-producer');
});

test('falta de fecha, precio o stock conserva desconocido', () => {
  const f = fixture(); Object.assign(f.evidence[0], { lastUpdated: null, price: null, stock: null });
  const r = reconcileOfferEvidence(f);
  assert.equal(r.status, 'unknown');
  assert.equal(r.evidence[0].fresh3h, null);
  assert.equal(r.producerToPublic.priceDifferenceARS, null);
  assert.equal(r.producerToPublic.stockMatches, null);
});

for (const field of ['productId', 'storeId', 'url']) {
  test(`destino diferente (${field}) impide comparar observaciones y precios`, () => {
    const f = fixture(); f.evidence[1][field] += '-different';
    const r = reconcileOfferEvidence(f);
    assert.equal(r.status, 'different-destination');
    assert.equal(r.producerToPublic.observationDifferenceMs, null);
    assert.equal(r.producerToPublic.priceDifferenceARS, null);
    assert.equal(r.snapshotToPublic.observationMatches, null);
  });
}

test('no oculta una condición de pago diferente', () => {
  const f = fixture(); f.evidence[2].priceCondition = 'regular';
  assert.equal(reconcileOfferEvidence(f).producerToPublic.conditionMatches, false);
});

test('el límite de tres horas conserva la fecha propia y no la captura', () => {
  const f = fixture(); f.evidence[0].lastUpdated = '2026-10-13T10:00:00.001Z';
  assert.equal(reconcileOfferEvidence(f).evidence[0].fresh3h, true);
  f.evidence[0].lastUpdated = '2026-10-13T09:59:59.999Z';
  assert.equal(reconcileOfferEvidence(f).evidence[0].fresh3h, false);
});

for (const mutation of [
  f => { f.evidence[0].lastUpdated = '2026-10-14T12:00:00Z'; },
  f => { f.evidence[0].capturedAt = '2026-10-14T12:00:00Z'; },
  f => { f.evidence[0].lastUpdated = 'not-a-date'; },
  f => { f.evidence[0].lastUpdated = '2026-02-30T12:00:00Z'; },
  f => { f.evidence[0].price = '1202122'; },
  f => { f.evidence[0].currency = 'USD'; },
  f => { f.evidence[0].stock = 'maybe'; },
  f => { f.evidence[1].role = 'producer'; },
  f => { f.evidence.pop(); },
]) {
  test('entrada inválida o futura se rechaza sin inventar un corte', () => {
    const f = fixture(); mutation(f); assert.throws(() => reconcileOfferEvidence(f), /OFFER_EVIDENCE_/);
  });
}
