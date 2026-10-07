import assert from 'node:assert/strict';
import test from 'node:test';
import { HISTORY_COLUMNS, canonicalUtcTimestamp, exportHistorySample, parseHistoryCsv } from './history-archive-export.mjs';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const header = HISTORY_COLUMNS.join(',');
const row = (n, extra = '') => `${id(n)},p,s,123456789012.34,,unknown,2026-03-05 01:51:12.123456+00,${extra}`;
const csv = records => `${header}\r\n${records.join('\r\n')}\r\n`;

test('CSV conserva dinero, microsegundos, null, texto vacío y separadores escapados', () => {
  const rows = parseHistoryCsv(csv([row(1), row(2, '""'), row(3, '"https://example.com/a,b?x=""q""\r\nz"')]));
  assert.equal(rows[0].price, '123456789012.34');
  assert.equal(rows[0].recorded_at, '2026-03-05T01:51:12.123456Z');
  assert.equal(rows[0].original_price, null);
  assert.equal(rows[0].offer_url, null);
  assert.equal(rows[1].offer_url, '');
  assert.equal(rows[2].offer_url, 'https://example.com/a,b?x="q"\r\nz');
});

test('rechaza CSV truncado, columnas inesperadas y fechas que pierden información', () => {
  for (const value of [csv([row(1, '"incomplete')]), csv([row(1, '"ok"junk')]), `${header}\n${row(1)},extra`, header.replace('price', 'unexpected')]) {
    assert.throws(() => parseHistoryCsv(value));
  }
  for (const value of ['2026-02-30T00:00:00Z', '2026-03-05T00:00:00-03:00', '2026-03-05T00:00:00.1234567Z']) assert.throws(() => canonicalUtcTimestamp(value));
  assert.equal(canonicalUtcTimestamp('2026-05-14 06:12:34.18+00'), '2026-05-14T06:12:34.180000Z');
});

test('paginación usa corte fijo y cursor por id; continuar no repite filas', async () => {
  const calls = [];
  const source = [1, 2, 3, 4];
  const readPage = async params => {
    calls.push(params);
    return csv(source.filter(n => id(n) > params.afterId).slice(0, params.limit).map(n => row(n)));
  };
  const first = await exportHistorySample(readPage, { cutoff: '2026-07-09T00:00:00Z', limit: 3, pageSize: 2 });
  assert.deepEqual(first.rows.map(r => r.id), [id(1), id(2), id(3)]);
  const second = await exportHistorySample(readPage, { cutoff: first.receipt.cutoff, afterId: first.receipt.nextCursor, limit: 3 });
  assert.deepEqual(second.rows.map(r => r.id), [id(4)]);
  assert.ok(calls.every(p => p.cutoff === '2026-07-09T00:00:00.000000Z'));
  assert.equal(second.receipt.reachedSourceEnd, true);
  assert.equal(second.receipt.globallyComplete, false);
});

test('fallos de página, repetición, desorden y filas fuera del corte no producen entrega parcial', async () => {
  const options = { cutoff: '2026-07-09T00:00:00Z', limit: 3, pageSize: 2 };
  await assert.rejects(exportHistorySample(async ({ afterId }) => {
    if (afterId) throw new Error('SOURCE_FAILED');
    return csv([row(1), row(2)]);
  }, options), /SOURCE_FAILED/);
  for (const records of [[row(2), row(1)], [row(1), row(1)], [row(1).replace('2026-03-05', '2026-08-05')]]) {
    await assert.rejects(exportHistorySample(async () => csv(records), options));
  }
  await assert.rejects(exportHistorySample(async () => csv([row(1)]), { ...options, limit: 1001 }), /BUDGET/);
});
