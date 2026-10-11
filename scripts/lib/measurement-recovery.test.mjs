import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEnebaCache, collectMeasurementsWithRecovery, measurementCollectionOutcome } from './measurement-recovery.mjs';

const dashboard = (state = 'error', storage = true) => ({ dashboard: { storage: { available: storage },
  connections: [{ id: 'eneba', state }, { id: 'ga4', state: 'connected' }] } });
function harness({ cache = 'expired', enabled = true, producerError = false, state = 'error', storage = true, retryState = 'connected' } = {}) {
  const calls = [], first = dashboard(state, storage), second = dashboard(retryState);
  return { calls, first, second, dependencies: { enebaEnabled: enabled,
    collect: async command => { calls.push(command.provider); return calls.length === 1 ? first : second; },
    inspectEnebaCache: async () => { calls.push('inspect'); return cache; },
    refreshEneba: async () => { calls.push('producer'); if (producerError) throw new Error('PRIVATE_CREDENTIAL'); },
  } };
}
test('clasifica ausente/vencida sin usar errores de DB ni payload inválido como ausencia', () => {
  const now = Date.parse('2026-10-11T13:29:23Z');
  assert.equal(classifyEnebaCache({ data: null, error: null }, now), 'missing');
  assert.equal(classifyEnebaCache({ data: null, error: { message: 'secret' } }, now), 'unavailable');
  for (const [expires_at, status, expected] of [['2026-10-11T13:20:50Z', 'ready', 'expired'],
    ['2026-10-11T13:29:23Z', 'empty', 'expired'], ['2026-10-11T13:29:24Z', 'ready', 'current'],
    ['invalid', 'ready', 'unavailable'], ['2026-10-11T13:20:50Z', 'error', 'unavailable']]) {
    assert.equal(classifyEnebaCache({ data: { expires_at, payload: { status } }, error: null }, now), expected);
  }
});
for (const provider of ['all', 'eneba']) for (const cache of ['missing', 'expired']) {
  test(`recupera ${cache} para ${provider} con un productor y sólo relectura Eneba`, async () => {
    const h = harness({ cache }); const output = await collectMeasurementsWithRecovery(provider, h.dependencies);
    assert.deepEqual(h.calls, [provider, 'inspect', 'producer', 'eneba']);
    assert.equal(output.result, h.second); assert.equal(output.recovery, 'refreshed');
  });
}
for (const options of [{ enabled: false }, { state: 'connected' }, { state: 'needs_setup' },
  { storage: false }, { cache: 'current' }, { cache: 'unavailable' }]) {
  test('no intenta renovación no autorizada o no recuperable: ' + JSON.stringify(options), async () => {
    const h = harness(options); const output = await collectMeasurementsWithRecovery('all', h.dependencies);
    assert.equal(output.result, h.first); assert.ok(!h.calls.includes('producer')); assert.equal(h.calls.filter(x => x === 'all').length, 1);
  });
}
test('otras fuentes no disparan lectura ni renovación Eneba aunque historial diga error', async () => {
  const h = harness(); await collectMeasurementsWithRecovery('ga4', h.dependencies); assert.deepEqual(h.calls, ['ga4']);
});
test('productor fallido conserva estado error para exit1 y no filtra la excepción', async () => {
  const h = harness({ producerError: true }); const output = await collectMeasurementsWithRecovery('all', h.dependencies);
  assert.deepEqual(h.calls, ['all', 'inspect', 'producer']); assert.equal(output.result, h.first);
  assert.equal(output.result.dashboard.connections[0].state, 'error'); assert.equal(output.recovery, 'producer-failed');
  assert.equal(measurementCollectionOutcome(output.result, 'all').exitCode, 1);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE_CREDENTIAL/);
});
test('una renovación no convierte la relectura fallida en éxito ni repite otra vez', async () => {
  const h = harness({ retryState: 'error' }); const output = await collectMeasurementsWithRecovery('all', h.dependencies);
  assert.equal(output.result.dashboard.connections[0].state, 'error'); assert.deepEqual(h.calls, ['all', 'inspect', 'producer', 'eneba']);
  assert.equal(measurementCollectionOutcome(output.result, 'all').exitCode, 1);
});
test('renovar Eneba no silencia el fallo de otra fuente de sync all', async () => {
  const h = harness();
  h.first.dashboard.connections[1].state = 'error';
  // El servicio persiste el primer sync y devuelve el dashboard completo tras sync eneba.
  h.second.dashboard.connections[1] = { ...h.first.dashboard.connections[1] };
  const output = await collectMeasurementsWithRecovery('all', h.dependencies);
  assert.deepEqual(measurementCollectionOutcome(output.result, 'all'), { verified: 1, needsSetup: 0, failed: ['ga4'], exitCode: 1 });
});
