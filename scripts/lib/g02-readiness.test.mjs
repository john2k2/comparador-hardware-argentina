import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateG02Readiness } from './g02-readiness.mjs';
const now = '2026-10-03T13:00:00Z';
const ids = Array.from({length: 9}, (_, i) => `p${i}`);
const cycles = Array.from({length: 7}, (_, i) => ({
  inicio_ciclo: `2026-09-${26+i}T05:05:00Z`, event: 'schedule', ciclo_util: 'si', run_id: `${100+i}`,
  observaciones: '5', productos: '3', tiendas_observadas: '2', fuente: `artifact-${i}.json`,
}));
// Fechas reales cruzando de mes, sin depender del parseo tolerante de fechas inválidas.
cycles[5].inicio_ciclo = '2026-10-01T05:05:00Z'; cycles[6].inicio_ciclo = '2026-10-02T05:05:00Z';
const snapshot = { measuredAt: now, denominator: 100, fresh24h: 95,
  sample: { denominator: 10, fresh24h: 10, byProduct: ids.map(productId => ({ productId, identityAccepted3h: 1, fresh3h: 1 })) } };
test('siete días útiles con cobertura sólo habilitan revisión, nunca cierran G02', () => {
  assert.equal(evaluateG02Readiness(cycles, snapshot, ids, now).status, 'ready-for-review');
});
test('manuales, repeticiones horarias y cortes sin calidad no suman días', () => {
  const input = [cycles[0], {...cycles[0], run_id:'999'}, {...cycles[1], event:'workflow_dispatch'}, {...cycles[2], ciclo_util:'pendiente_calidad'}];
  const report = evaluateG02Readiness(input, snapshot, ids, now);
  assert.equal(report.usefulDailyCycles, 1);
  assert.equal(report.status, 'not-ready');
});
test('no sustituye la muestra, no infiere identidad ausente ni acepta cortes vencidos', () => {
  const bad = {...snapshot, measuredAt:'2026-10-02T13:00:00Z', sample: {...snapshot.sample,
    byProduct: ids.map(productId => ({productId, fresh3h: 1}))}};
  const report = evaluateG02Readiness(cycles, bad, ids, now);
  assert.ok(report.blockers.includes('fixed-products-without-accepted-recent-offer'));
  assert.ok(report.blockers.includes('missing-or-stale-freshness-snapshot'));
  assert.equal(evaluateG02Readiness(cycles, {...bad, sample:{...bad.sample, byProduct:[]}}, ids, now).fixedSampleMatches, false);
});
test('cero denominador o conteos ausentes no son una meta de frescura cumplida', () => {
  const report = evaluateG02Readiness(cycles, {...snapshot, denominator:0}, ids, now);
  assert.equal(report.globalFresh24hRatio, null);
  assert.ok(report.blockers.includes('global-freshness-below-proposed-95-percent'));
});
