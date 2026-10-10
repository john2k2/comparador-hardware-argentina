import { expect, it } from 'vitest';
import { createPersistenceDiagnostic, createPersistenceObservation, observePersistenceError,
  observePersistenceResponse, recordPersistenceDiagnostic, snapshotPersistenceDiagnostic } from './persistence-diagnostics';

it.each([
  [[{ data: false, error: null }], 'returnedFalse'],
  [[{ data: 'true', error: null }], 'invalidResponse'],
  [[null], 'invalidResponse'],
  [[{ data: 'true' }, { data: false }], 'ackUnconfirmed'],
  [[{ error: { code: '57014' } }, { data: false }], 'ackUnconfirmed'],
  [[{ error: { code: '57014' } }, { data: {} }], 'ackUnconfirmed'],
  [[{ data: {} }, { data: true }], 'confirmed'],
  [[{ error: { code: '57014' } }, { data: true }], 'confirmed'],
] as const)('clasifica una observación completa %j como %s', (responses, outcome) => {
  const diagnostic = createPersistenceDiagnostic(), observation = createPersistenceObservation();
  for (const response of responses) observePersistenceResponse(observation, response);
  recordPersistenceDiagnostic(diagnostic, 'maximus', observation);
  recordPersistenceDiagnostic(diagnostic, 'maximus', observation);
  expect(diagnostic.logicalObservations).toBe(1);
  expect(diagnostic.global[outcome]).toBe(1);
  expect(diagnostic.byStore.maximus).toEqual(diagnostic.global);
  expect(diagnostic.global.confirmed + diagnostic.global.returnedFalse + diagnostic.global.ackUnconfirmed + diagnostic.global.invalidResponse).toBe(1);
});

it('cuenta cada código una vez por observación y acota códigos y tiendas desconocidos', () => {
  const diagnostic = createPersistenceDiagnostic(), observation = createPersistenceObservation();
  for (const code of ['57014', '57014', 'PRIVATE-https://example.com/user', 'XX999', 'unknown']) {
    observePersistenceError(observation, { code, message: 'respuesta privada', details: 'payload privado' });
  }
  recordPersistenceDiagnostic(diagnostic, 'PRIVATE-https://example.com/user', observation);
  expect(diagnostic.global.errorCodes).toEqual({ '57014': 1, unknown: 1 });
  expect(Object.keys(diagnostic.byStore)).toEqual(['unknown-store']);
  expect(JSON.stringify(diagnostic)).not.toMatch(/PRIVATE|https:|respuesta privada|payload privado/);
});

it('conserva incertidumbre ante un error lanzado o un ACK ilegible sin invocar getters al serializar', () => {
  const diagnostic = createPersistenceDiagnostic(), thrown = createPersistenceObservation(), invalid = createPersistenceObservation();
  observePersistenceError(thrown, { get code() { throw new Error('privado'); } });
  observePersistenceResponse(invalid, { get data() { throw new Error('privado'); } });
  recordPersistenceDiagnostic(diagnostic, 'maximus', thrown);
  recordPersistenceDiagnostic(diagnostic, 'mexx', invalid);
  expect(diagnostic).toMatchObject({ logicalObservations: 2, global: { ackUnconfirmed: 1, invalidResponse: 1, errorCodes: { unknown: 1 } },
    byStore: { maximus: { ackUnconfirmed: 1 }, mexx: { invalidResponse: 1 } } });
  expect(JSON.stringify(diagnostic)).not.toContain('privado');
});

it('congela por copia el avance anterior y no registra observaciones sin intento de persistencia', () => {
  const diagnostic = createPersistenceDiagnostic(), first = createPersistenceObservation();
  recordPersistenceDiagnostic(diagnostic, 'maximus', first);
  expect(diagnostic.logicalObservations).toBe(0);
  observePersistenceResponse(first, { data: true });
  recordPersistenceDiagnostic(diagnostic, 'maximus', first);
  const progress = snapshotPersistenceDiagnostic(diagnostic), second = createPersistenceObservation();
  observePersistenceError(second, { code: '57014' });
  recordPersistenceDiagnostic(diagnostic, 'maximus', second);
  expect(progress).toMatchObject({ logicalObservations: 1, global: { confirmed: 1, ackUnconfirmed: 0, errorCodes: {} },
    byStore: { maximus: { confirmed: 1, ackUnconfirmed: 0, errorCodes: {} } } });
  expect(diagnostic.logicalObservations).toBe(2);
});
