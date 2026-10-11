import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCatalogRunSummary } from './catalog-run-summary.mjs';
test('explica fallo de Katech y ACK parciales sin declarar cobertura', () => {
  const summary = formatCatalogRunSummary({ status: 'failed', attempted: 1654, observed: 1189, comparable: 475,
    inventory: [{ storeId: 'katech', status: 'failed', code: 'blocked' }],
    persistenceDiagnostic: { global: { confirmed: 1189, ackUnconfirmed: 0, invalidResponse: 0 } } });
  assert.match(summary, /katech — blocked/); assert.match(summary, /1189 confirmados/); assert.match(summary, /conserva exit 1/);
  assert.match(summary, /no acredita cobertura completa/);
});
test('sanea campos libres y no expone datos o credenciales en el resumen', () => {
  const summary = formatCatalogRunSummary({ status: 'PRIVATE_CREDENTIAL', attempted: 'PRIVATE_CREDENTIAL',
    error: 'PRIVATE_CREDENTIAL', token: 'PRIVATE_CREDENTIAL', sourceHttp: { url: 'PRIVATE_CREDENTIAL' },
    inventory: [{ storeId: 'PRIVATE_CREDENTIAL', status: 'failed', code: 'PRIVATE_CREDENTIAL' }],
    persistenceDiagnostic: { global: { confirmed: 'PRIVATE_CREDENTIAL' } } });
  assert.doesNotMatch(summary, /PRIVATE_CREDENTIAL/); assert.match(summary, /otra fuente/);
});
test('preserva diagnósticos duros y ausencia de denominador sin inventar ceros', () => {
  const summary = formatCatalogRunSummary({ status: 'failed', error: 'REFRESH_RUNNER_TIMEOUT' });
  assert.match(summary, /REFRESH_RUNNER_TIMEOUT/); assert.match(summary, /Observadas: no informado/);
  assert.throws(() => formatCatalogRunSummary([]), /REFRESH_SUMMARY_INVALID/);
});
