import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeOffer, analyzeSample, buildJevRequest, parseJevJudgment } from './catalog-quality.mjs';

const now = '2026-09-21T12:00:00Z';
const offer = {
  id: 'offer_01', category: 'tarjetas-graficas', productName: 'ASUS RTX 4060 Dual OC 8GB',
  storeId: 'example', url: 'https://example.com/asus-rtx-4060-dual-oc-8gb',
  price: 500000, stock: 'in-stock', lastUpdated: '2026-09-21T11:00:00Z',
};
const consistent = {
  type: 'choice', choice: 'identity_consistent', confidence: 1,
  probabilities: { identity_consistent: 1, identity_conflict: 0, identity_uncertain: 0 },
};

test('una aprobación del modelo no rejuvenece una oferta vencida', () => {
  const result = analyzeOffer({ ...offer, lastUpdated: '2026-04-21T12:00:00Z' }, consistent, { now });
  assert.equal(result.disposition, 'recheck');
  assert.ok(result.reasons.includes('stale_offer'));
  assert.equal(result.verifiedAtSource, false);
});

test('separa chips distintos aunque el modelo diga que coinciden', () => {
  const result = analyzeOffer({ ...offer, url: 'https://example.com/asus-rtx-5060-dual-oc-8gb' }, consistent, { now });
  assert.equal(result.disposition, 'exclude_from_comparison');
  assert.ok(result.reasons.includes('explicit_chip_conflict'));
});

test('stock desconocido requiere corroboración aunque pase el filtro individual antiguo', () => {
  const result = analyzeOffer({ ...offer, stock: 'unknown' }, consistent, { now });
  assert.equal(result.legacyComparisonStockEligible, true);
  assert.equal(result.disposition, 'recheck');
  assert.ok(result.reasons.includes('unknown_stock'));
});

test('fecha de producto reciente no sustituye fecha de oferta ausente o futura', () => {
  for (const lastUpdated of [undefined, '2027-01-01T00:00:00Z']) {
    const result = analyzeOffer({ ...offer, lastUpdated, productUpdatedAt: now }, consistent, { now });
    assert.equal(result.disposition, 'recheck');
    assert.equal(result.verifiedAtSource, false);
  }
});

test('una discrepancia semántica propone revisar, no modificar ni eliminar la oferta', () => {
  const conflict = { ...consistent, choice: 'identity_conflict', probabilities: { identity_consistent: 0, identity_conflict: 1, identity_uncertain: 0 } };
  assert.equal(analyzeOffer(offer, conflict, { now }).disposition, 'recheck');
  assert.equal(analyzeOffer(offer, consistent, { now }).disposition, 'catalog_candidate');
});

test('un visto bueno de baja confianza pide corroboración incluso con datos recientes', () => {
  const uncertainApproval = {
    type: 'choice', choice: 'identity_consistent', confidence: 0.15,
    probabilities: { identity_consistent: 0.43, identity_conflict: 0.16, identity_uncertain: 0.41 },
  };
  const result = analyzeOffer(offer, uncertainApproval, { now });
  assert.equal(result.disposition, 'recheck');
  assert.ok(result.reasons.includes('jev_low_confidence'));
  assert.equal(result.verifiedAtSource, false);
  assert.throws(() => analyzeOffer(offer, consistent, { now, minJevConfidence: 2 }), /umbral/);
});

test('respuestas malformadas y elecciones ajenas al contrato no habilitan candidatos', () => {
  for (const invalid of [null, {}, { ...consistent, choice: 'publish' }, { ...consistent, confidence: 2 }, { ...consistent, probabilities: { identity_consistent: 0.5 } }]) {
    assert.equal(parseJevJudgment(invalid), null);
    assert.equal(analyzeOffer(offer, invalid, { now }).disposition, 'recheck');
  }
});

test('precio no numérico y enlaces inválidos quedan fuera de comparación', () => {
  for (const invalid of [{ price: 0 }, { price: '500000' }, { url: 'javascript:alert(1)' }, { url: 'https://user:password@example.com/product' }]) {
    assert.equal(analyzeOffer({ ...offer, ...invalid }, consistent, { now }).disposition, 'exclude_from_comparison');
  }
});

test('la muestra conserva fecha fija y los requests sólo incluyen evidencia pública necesaria', () => {
  const sample = { capturedAt: now, offers: [{ ...offer, privateNote: 'no-enviar' }] };
  assert.equal(analyzeSample(sample).summary.offerCount, 1);
  const request = buildJevRequest(sample.offers);
  assert.equal(request.state.includes('no-enviar'), false);
  assert.equal(request.state.includes('price'), false);
  assert.deepEqual(Object.keys(request.questions), ['offer_01']);
  assert.throws(() => buildJevRequest([offer, offer]), /duplicados/);
  assert.throws(() => buildJevRequest(Array.from({ length: 9 }, (_, i) => ({ ...offer, id: `offer_${i}` }))), /entre 1 y 8/);
  assert.throws(() => analyzeOffer(offer, undefined, { now: 'invalid' }), /fecha válida/);
});
