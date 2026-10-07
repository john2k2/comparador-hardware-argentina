import assert from 'node:assert/strict';
import test from 'node:test';
import { processTelemetryRetentionPlan } from './telemetry-retention.mjs';

const options = { cutoff: '2026-10-07T20:00:00.123456Z', now: '2026-10-07T20:01:00.000000Z', limit: 250 };
const row = (index = 1, fields = {}) => ({
  cache_key: `operational-store-event:${index}`, scope: 'operational-store-event',
  expires_at: '2026-10-07T19:00:00.123456+00:00', updated_at: '2026-10-05T19:00:00.123456+00:00', ...fields,
});
const apply = { ...options, mode: 'apply', approvalId: 'local-fake-test-only' };

function fakeClient(initialRows, { beforeDelete, deleteReply, selectionReply } = {}) {
  const state = { rows: structuredClone(initialRows), calls: [], deletes: 0, inFlight: 0, maxInFlight: 0 };
  const matches = (candidate, [operation, field, value]) => {
    if (operation === 'eq') return candidate[field] === value;
    if (operation === 'in') return value.includes(candidate[field]);
    const actual = field.endsWith('_at') ? Date.parse(candidate[field]) : candidate[field];
    const expected = field.endsWith('_at') ? Date.parse(value) : value;
    return operation === 'lt' ? actual < expected : actual <= expected;
  };
  const client = { from(table) {
    assert.equal(table, 'api_cache_entries');
    const filters = [];
    const orders = [];
    let operation = 'read'; let fields; let limit = Infinity;
    const query = {
      select(value) { fields = value; return query; },
      delete() { operation = 'delete'; return query; },
      eq(field, value) { filters.push(['eq', field, value]); return query; },
      in(field, value) { filters.push(['in', field, value]); return query; },
      lt(field, value) { filters.push(['lt', field, value]); return query; },
      lte(field, value) { filters.push(['lte', field, value]); return query; },
      order(field) { orders.push(field); return query; },
      limit(value) { limit = value; return query; },
      async then(resolve, reject) {
        try {
          state.calls.push({ operation, fields, filters: structuredClone(filters), limit });
          if (operation === 'read') {
            if (selectionReply) return resolve(await selectionReply());
            const selected = state.rows.filter(candidate => filters.every(filter => matches(candidate, filter)))
              .sort((a, b) => {
                for (const field of orders) { if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1; }
                return 0;
              }).slice(0, limit).map(candidate => Object.fromEntries(fields.split(',').map(field => [field, candidate[field]])));
            return resolve({ data: selected, error: null });
          }
          state.deletes++; state.inFlight++; state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
          try {
            await beforeDelete?.(state, state.deletes);
            const deleted = state.rows.filter(candidate => filters.every(filter => matches(candidate, filter)));
            state.rows = state.rows.filter(candidate => !deleted.includes(candidate));
            const reply = deleteReply ? await deleteReply(state, deleted) : { data: deleted.map(candidate => ({ cache_key: candidate.cache_key })), error: null };
            resolve(reply);
          } finally { state.inFlight--; }
        } catch (error) { reject(error); }
      },
    };
    return query;
  } };
  return { client, state };
}

test('default dry-run sólo selecciona metadata de eventos vencidos y no borra', async () => {
  const initial = [row(), row(2, { scope: 'operational-endpoint-event' }), row(3, { scope: 'product-detail-v3' }),
    row(4, { expires_at: '2026-10-08T00:00:00Z' }), row(5, { updated_at: '2026-10-07T20:30:00Z' })];
  const { client, state } = fakeClient(initial);
  const result = await processTelemetryRetentionPlan(client, options);
  assert.equal(result.mode, 'dry-run'); assert.equal(result.selected, 2); assert.equal(result.success, true);
  assert.equal(result.removed, 0); assert.equal(state.deletes, 0); assert.deepEqual(state.rows, initial);
  assert.deepEqual(Object.keys(result.rows[0]), ['cache_key', 'scope', 'expires_at', 'updated_at']);
  assert.equal(state.calls[0].fields, 'cache_key,scope,expires_at,updated_at');
});

test('approval ausente, cutoff futuro, fechas inválidas, límites y scope desconocido fallan antes del client', async () => {
  const client = { from() { assert.fail('client must not be called'); } };
  for (const invalid of [
    { ...options, mode: 'apply' }, { ...apply, approvalId: ' ' }, { ...options, mode: 'delete' },
    { ...options, cutoff: '2026-10-08T00:00:00Z' }, { ...options, now: 'invalid' },
    { ...options, cutoff: '2026-02-29T00:00:00Z' }, { ...options, now: '2026-10-07T20:01:00-03:00' },
    { ...options, limit: 251 }, { ...options, limit: 0 }, { ...options, scope: 'product-detail-v3' },
  ]) await assert.rejects(processTelemetryRetentionPlan(client, invalid));
  await assert.rejects(processTelemetryRetentionPlan(client, Object.assign(Object.create({ approvalId: 'inherited' }), options, { mode: 'apply' })));
  await assert.rejects(processTelemetryRetentionPlan(client, { ...options, cutoff: '2026-10-07T20:01:00.000001Z' }));
});

test('selección fuera del límite solicitado aborta antes de borrar', async () => {
  const { client, state } = fakeClient([], { selectionReply: () => ({ data: [row(), row(2)], error: null }) });
  await assert.rejects(processTelemetryRetentionPlan(client, { ...apply, limit: 1 }), /candidate count/);
  assert.equal(state.deletes, 0);
});

test('valida todo el lote antes de borrar: nunca acepta activos, otros scopes, payload ni duplicados', async () => {
  for (const invalid of [row(2, { scope: 'product-detail-v3' }), row(2, { expires_at: options.cutoff }),
    row(2, { updated_at: '2026-10-07T20:00:00.123457Z' }), { ...row(2), payload: 'must not read' }, row()]) {
    const { client, state } = fakeClient([], { selectionReply: () => ({ data: [row(), invalid], error: null }) });
    await assert.rejects(processTelemetryRetentionPlan(client, apply)); assert.equal(state.deletes, 0);
  }
});

test('renovación entre select/delete queda intacta y matching usa microsegundos UTC literales', async () => {
  const { client, state } = fakeClient([row(), row(2)], { beforeDelete(state, index) {
    if (index === 1) state.rows[0].updated_at = '2026-10-05T19:00:00.123457+00:00';
  } });
  const result = await processTelemetryRetentionPlan(client, apply);
  assert.equal(result.removed, 1); assert.equal(result.changedSkipped, 1); assert.equal(result.success, true);
  assert.equal(state.rows.length, 1); assert.equal(state.rows[0].cache_key, row().cache_key);
  assert.deepEqual(state.calls[1].filters, [
    ['eq', 'cache_key', row().cache_key], ['eq', 'scope', row().scope], ['eq', 'expires_at', row().expires_at],
    ['eq', 'updated_at', row().updated_at], ['lt', 'expires_at', options.cutoff],
  ]);
});

test('ACK ambiguo después de commit conserva éxitos conocidos, marca unknown y corta sin reintento', async () => {
  for (const reply of [null, { data: null, error: null }, { data: [], error: { status: 503 } },
    { data: [{ cache_key: 'wrong' }], error: null }, { data: [row(), row()], error: null }]) {
    const { client, state } = fakeClient([row(), row(2), row(3)], { deleteReply(state, deleted) {
      return state.deletes === 1 ? { data: [{ cache_key: deleted[0].cache_key }], error: null } : reply;
    } });
    const result = await processTelemetryRetentionPlan(client, apply);
    assert.equal(result.selected, 3); assert.equal(result.removed, 1); assert.equal(result.unknown, 1);
    assert.equal(result.stopped, true); assert.equal(result.success, false); assert.equal(state.deletes, 2);
    assert.equal(state.rows.length, 1); assert.equal(state.rows[0].cache_key, row(3).cache_key);
  }
});

test('excepción de transporte luego de commit no afirma borrado ni reintenta', async () => {
  const { client, state } = fakeClient([row(), row(2)], { deleteReply() { throw new Error('private transport detail'); } });
  const result = await processTelemetryRetentionPlan(client, apply);
  assert.equal(result.removed, 0); assert.equal(result.unknown, 1); assert.equal(result.stopped, true);
  assert.equal(result.success, false); assert.equal(state.deletes, 1);
  assert.equal(JSON.stringify(result).includes('private transport detail'), false);
});

test('un lote máximo de250 se concilia en serie y preserva activos/no telemetría', async () => {
  const events = Array.from({ length: 260 }, (_, i) => row(i + 1));
  const protectedRows = [row(900, { scope: 'home-sections' }), row(901, { expires_at: '2026-10-08T00:00:00Z' })];
  const { client, state } = fakeClient([...events, ...protectedRows]);
  const result = await processTelemetryRetentionPlan(client, apply);
  assert.equal(result.selected, 250); assert.equal(result.removed, 250); assert.equal(result.changedSkipped, 0);
  assert.equal(result.unknown, 0); assert.equal(result.success, true); assert.equal(state.deletes, 250);
  assert.equal(state.maxInFlight, 1); assert.equal(state.rows.length, 12);
  for (const protectedRow of protectedRows) assert.ok(state.rows.some(candidate => candidate.cache_key === protectedRow.cache_key));
});

test('error de lectura retorna plan detenido y no inicia deletes', async () => {
  for (const selectionReply of [() => ({ data: null, error: { message: 'private' } }), () => { throw new Error('private'); }]) {
    const { client, state } = fakeClient([row()], { selectionReply });
    const result = await processTelemetryRetentionPlan(client, apply);
    assert.equal(result.selected, 0); assert.equal(result.removed, 0); assert.equal(result.unknown, 0);
    assert.equal(result.stopped, true); assert.equal(result.success, false); assert.equal(state.deletes, 0);
  }
});
