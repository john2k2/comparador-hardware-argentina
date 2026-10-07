import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { TELEMETRY_COLUMNS, parseTelemetryCsv, buildTelemetryBackup, verifyTelemetryBackup } from './telemetry-backup.mjs';

const row = (index = 1, fields = {}) => ({
  cache_key: `operational-store-event:${String(index).padStart(3, '0')}`, scope: 'operational-store-event',
  payload: '{"resultCount":9007199254740993123456789,"optional":null,"message":"a,b\\n\\\"c\\\""}',
  expires_at: '2026-10-07T19:00:00.123456+00:00', created_at: '2026-10-05 19:00:00.000001+00',
  updated_at: '2026-10-05T19:00:00.123456+00:00', ...fields,
});
const anchors = rows => rows.map(({ cache_key, scope, expires_at, updated_at }) => ({ cache_key, scope, expires_at, updated_at }));
const optionsFor = rows => ({ projectId: 'synthetic-project', cutoff: '2026-10-07T20:00:00.123456Z',
  selectionSha256: 'a'.repeat(64), selection: anchors(rows) });
const canonical = value => ({ ...value, expires_at: '2026-10-07T19:00:00.123456Z',
  created_at: '2026-10-05T19:00:00.000001Z', updated_at: '2026-10-05T19:00:00.123456Z' });
const cell = value => value === null ? '' : `"${value.replaceAll('"', '""')}"`;
const csvFor = rows => TELEMETRY_COLUMNS.join(',') + '\r\n'
  + rows.map(value => TELEMETRY_COLUMNS.map(field => cell(value[field])).join(',')).join('\r\n') + '\r\n';
const hash = value => createHash('sha256').update(value).digest('hex');
const expectRejected = (archive, options, transform) => {
  const manifest = structuredClone(archive.manifest); transform(manifest);
  assert.throws(() => verifyTelemetryBackup(manifest, archive.gzipBytes, options));
};

test('CSV preserva payload textual, números grandes, null JSON, escapes y seis microsegundos', () => {
  const source = [row(), row(2, { payload: '{\n "name":"ñ, \\"x\\"",\n "value":null\n}' }), row(3, { payload: 'null' }), row(4, { payload: '""' })];
  const parsed = parseTelemetryCsv(csvFor(source));
  assert.deepEqual(parsed, source.map(canonical));
  const options = optionsFor(source);
  const archive = buildTelemetryBackup(parsed, options);
  assert.deepEqual(verifyTelemetryBackup(archive.manifest, archive.gzipBytes, options), parsed);
  assert.ok(parsed[0].payload.includes('9007199254740993123456789'));
});

test('CSV distingue texto vacío de SQL NULL y rechaza ambos cuando no son JSON válido', () => {
  for (const payload of [null, '']) assert.throws(() => parseTelemetryCsv(csvFor([row(1, { payload })])));
  assert.deepEqual(parseTelemetryCsv(csvFor([row(1, { payload: '""' })]))[0].payload, '""');
  for (const field of TELEMETRY_COLUMNS) assert.throws(() => parseTelemetryCsv(csvFor([row(1, { [field]: null })])));
});

test('CSV rechaza header/columnas inesperadas, quoting roto, trailing texto y cero filas', () => {
  const csv = csvFor([row()]);
  for (const invalid of [csv.replace('created_at', 'unknown'), csv + '\r\n', csv.slice(0, -4),
    csv.replace('"operational-store-event:001"', '"operational-store-event:001"trailing'),
    csv.replace('"operational-store-event:001"', 'operational"store'), TELEMETRY_COLUMNS.join(',') + '\n']) {
    assert.throws(() => parseTelemetryCsv(invalid));
  }
});

test('bytes y manifiesto son determinísticos ante distinto orden de filas/anclas', () => {
  const rows = [row(2), row()];
  const options = optionsFor(rows);
  const first = buildTelemetryBackup(rows, options);
  const second = buildTelemetryBackup([...rows].reverse(), { ...options, selection: [...options.selection].reverse() });
  assert.deepEqual(first, second);
});

test('normaliza anclas UTC equivalentes sin redondear y rechaza renovación de un microsegundo', () => {
  const rows = [row()]; const options = optionsFor(rows);
  options.selection = anchors(rows.map(canonical));
  const archive = buildTelemetryBackup(rows, options);
  assert.equal(verifyTelemetryBackup(archive.manifest, archive.gzipBytes, options)[0].updated_at, canonical(row()).updated_at);
  assert.throws(() => buildTelemetryBackup([row(1, { updated_at: '2026-10-05T19:00:00.123457Z' })], options), /ANCHOR_MISMATCH/);
  const selection = anchors([row(1, { expires_at: '2026-10-07T19:00:00.123457Z' })]);
  assert.throws(() => verifyTelemetryBackup(archive.manifest, archive.gzipBytes, { ...options, selection }), /MANIFEST_ANCHOR/);
});

test('no acepta faltantes, extras, duplicados ni cambios de scope/key', () => {
  const rows = [row(), row(2)]; const options = optionsFor(rows);
  for (const changed of [[row()], [...rows, row(3)], [row(), row()], [row(), row(3)],
    [row(), row(2, { scope: 'operational-endpoint-event' })]]) assert.throws(() => buildTelemetryBackup(changed, options));
  assert.throws(() => buildTelemetryBackup(rows, { ...options, selection: [options.selection[0], options.selection[0]] }));
});

test('rechaza esquema extra, scopes ajenos, fechas inválidas y selección que no vence antes del corte', () => {
  for (const invalid of [{ ...row(), extra: true }, row(1, { scope: 'home-sections' }), row(1, { payload: {} }),
    row(1, { payload: '{private-content' }), row(1, { created_at: '2026-02-29T00:00:00Z' }),
    row(1, { created_at: '2026-10-05T19:00:00.1234567Z' }), row(1, { created_at: '2026-10-05T19:00:00-03:00' })]) {
    assert.throws(() => buildTelemetryBackup([invalid], optionsFor([row()])));
  }
  for (const fields of [{ expires_at: optionsFor([]).cutoff }, { updated_at: '2026-10-07T20:00:00.123457Z' }]) {
    const rows = [row(1, fields)]; assert.throws(() => buildTelemetryBackup(rows, optionsFor(rows)), /SELECTION_CUTOFF/);
  }
});

test('proyecto, recibo, corte, versión, límites y metadatos se verifican contra expected externo', () => {
  const rows = [row()]; const options = optionsFor(rows); const archive = buildTelemetryBackup(rows, options);
  for (const [field, value] of [['projectId', 'other'], ['cutoff', '2026-10-07T21:00:00.000000Z'], ['selectionSha256', 'b'.repeat(64)]]) {
    assert.throws(() => verifyTelemetryBackup(archive.manifest, archive.gzipBytes, { ...options, [field]: value }));
  }
  for (const change of [m => { m.version = 2; }, m => { m.rowCount = 2; }, m => { m.extra = true; },
    m => { m.limits.maxRows = 251; }, m => { m.rawSha256 = '0'.repeat(64); }, m => { m.scopes = ['home-sections']; }]) {
    expectRejected(archive, options, change);
  }
  assert.throws(() => verifyTelemetryBackup(archive.manifest, archive.gzipBytes));
  assert.throws(() => buildTelemetryBackup(rows, { ...options, extra: true }));
});

test('corrupción o gzip truncado no produce filas parciales incluso con hash gzip recalculado', () => {
  const rows = [row(), row(2)]; const options = optionsFor(rows); const archive = buildTelemetryBackup(rows, options);
  const corrupt = Buffer.from(archive.gzipBytes); corrupt[15] ^= 255;
  assert.throws(() => verifyTelemetryBackup(archive.manifest, corrupt, options), /GZIP_INTEGRITY/);
  const truncated = archive.gzipBytes.subarray(0, -3);
  const manifest = { ...archive.manifest, gzipBytes: truncated.length, gzipSha256: hash(truncated) };
  assert.throws(() => verifyTelemetryBackup(manifest, truncated, options), /GZIP_INVALID/);
});

test('verificador rechaza framing, orden, duplicados y anclas adulterados con hashes actualizados', () => {
  const rows = [row(), row(2)]; const options = optionsFor(rows); const archive = buildTelemetryBackup(rows, options);
  const normalized = rows.map(canonical);
  const cases = [[...normalized].reverse(), [normalized[0], normalized[0]],
    [normalized[0], { ...normalized[1], updated_at: '2026-10-05T19:00:00.123457Z' }]];
  const strings = [...cases.map(values => values.map(value => JSON.stringify(value) + '\n').join('')),
    normalized.map(value => JSON.stringify(value)).join('\n')];
  for (const content of strings) {
    const raw = Buffer.from(content); const gzip = gzipSync(raw);
    const manifest = { ...archive.manifest, rawBytes: raw.length, gzipBytes: gzip.length, rawSha256: hash(raw), gzipSha256: hash(gzip) };
    assert.throws(() => verifyTelemetryBackup(manifest, gzip, options));
  }
});

test('limita raw/gzip, corta bombas y admite exactamente250 filas', () => {
  const rows = Array.from({ length: 250 }, (_, index) => row(index + 1)); const options = optionsFor(rows);
  const archive = buildTelemetryBackup(rows, options);
  assert.deepEqual(verifyTelemetryBackup(archive.manifest, archive.gzipBytes, options), rows.map(canonical));
  assert.throws(() => buildTelemetryBackup([...rows, row(251)], optionsFor([...rows, row(251)])));
  assert.throws(() => buildTelemetryBackup([], optionsFor([])));
  const big = [row(1, { payload: JSON.stringify('x'.repeat(4 * 1024 ** 2)) })];
  assert.throws(() => buildTelemetryBackup(big, optionsFor(big)), /SIZE/);
  const incompressible = [row(1, { payload: JSON.stringify(randomBytes(1400_000).toString('base64')) })];
  assert.throws(() => buildTelemetryBackup(incompressible, optionsFor(incompressible)), /GZIP_SIZE/);
  const one = buildTelemetryBackup([row()], optionsFor([row()]));
  const bomb = gzipSync(Buffer.alloc(4 * 1024 ** 2 + 1, 65));
  const manifest = { ...one.manifest, gzipBytes: bomb.length, gzipSha256: hash(bomb) };
  assert.throws(() => verifyTelemetryBackup(manifest, bomb, optionsFor([row()])), /GZIP_INVALID/);
});

test('errores de JSON y archivo no revelan payload', () => {
  assert.throws(() => buildTelemetryBackup([row(1, { payload: 'private-payload-value' })], optionsFor([row()])), error => {
    assert.equal(error.message.includes('private-payload-value'), false); return true;
  });
});
