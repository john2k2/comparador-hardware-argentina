import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import test from 'node:test';
import { buildHistoryArchive, verifyHistoryArchive, readHistoryArchiveSelection } from './history-archive.mjs';

const options = {
  projectId: 'pilot-project', cutoff: '2026-07-09T00:00:00.000000Z', snapshotAt: '2026-10-07T19:16:07.876892Z',
};
const row = (index = 1, fields = {}) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, product_id: 'cpu-1', store_id: 'store-a',
  price: '999999999999.99', original_price: null, stock: 'unknown',
  recorded_at: '2026-07-01T12:03:04.123456Z', offer_url: null, ...fields,
});
const fetchFor = archive => async name => archive.chunks.get(name);
const hash = value => createHash('sha256').update(value).digest('hex');

test('restaura ocho columnas, decimales exactos, microsegundos y null; repite bytes determinísticos', async () => {
  const rows = [row(2, { price: '0', original_price: '8.1', stock: 'low-stock', offer_url: 'https://tienda.test/p?x=ñ' }), row()];
  const first = buildHistoryArchive(rows, options);
  const second = buildHistoryArchive([...rows].reverse(), options);
  assert.deepEqual(first, second);
  const restored = await verifyHistoryArchive(JSON.parse(JSON.stringify(first.manifest)), fetchFor(first), options);
  assert.deepEqual(restored, [row(), row(2, { price: '0.00', original_price: '8.10', stock: 'low-stock', offer_url: 'https://tienda.test/p?x=ñ' })]);
  assert.equal(first.manifest.source.consistency, 'non-transactional');
  assert.equal(gunzipSync([...first.chunks.values()][0]).toString().endsWith('\n'), true);
});

test('separa día/tienda y usa nombres seguros; filas y bytes producen cortes acotados', async () => {
  const rows = [row(), row(2), row(3, { recorded_at: '2026-07-02T00:00:00.000001Z' }), row(4, { store_id: '../otra/tienda' })];
  const archive = buildHistoryArchive(rows, { ...options, maxRowsPerChunk: 1 });
  assert.equal(archive.chunks.size, 4);
  for (const chunk of archive.manifest.chunks) {
    assert.match(chunk.name, /^2026-07-0[12]-[a-f0-9]{64}-\d{6}\.ndjson\.gz$/);
    assert.equal(chunk.rowCount, 1);
    assert.ok(chunk.gzipBytes <= 1024 ** 2 && chunk.rawBytes <= 8 * 1024 ** 2);
  }
  assert.equal((await verifyHistoryArchive(archive.manifest, fetchFor(archive))).length, 4);
  const rawSize = buildHistoryArchive([row()], options).manifest.chunks[0].rawBytes;
  const bytes = buildHistoryArchive([row(), row(2)], { ...options, maxRawBytes: rawSize });
  assert.equal(bytes.chunks.size, 2);
  const compressed = buildHistoryArchive([row(), row(2)], options);
  const oneSize = Math.max(...[row(), row(2)].map(value => buildHistoryArchive([value], options).manifest.chunks[0].gzipBytes));
  assert.ok(compressed.manifest.chunks[0].gzipBytes > oneSize);
  assert.equal(buildHistoryArchive([row(), row(2)], { ...options, maxCompressedBytes: oneSize }).chunks.size, 2);
  assert.throws(() => buildHistoryArchive([row()], { ...options, maxRawBytes: 10 }), /single row/);
});

test('rechaza entradas inválidas, extras, duplicados y límites fuera del piloto', () => {
  const badRows = [
    { ...row(), extra: true }, { ...row(), offer_url: undefined }, row(2, { offer_url: '\0' }), row(2, { price: 1.23 }),
    row(2, { price: '-1.00' }), row(2, { price: '1.234' }), row(2, { price: '1000000000000.00' }),
    row(2, { price: '1e2' }), row(2, { original_price: '-1.234' }), row(2, { id: 'not-uuid' }),
    row(2, { stock: 'available' }), row(2, { product_id: '' }), row(2, { store_id: null }),
    row(2, { recorded_at: '2026-07-01T12:03:04.123Z' }), row(2, { recorded_at: '2026-02-29T00:00:00.000000Z' }),
    row(2, { recorded_at: options.cutoff }), row(2, { recorded_at: '2026-07-01T24:00:00.000000Z' }),
  ];
  for (const invalid of badRows) assert.throws(() => buildHistoryArchive([invalid], options));
  assert.throws(() => buildHistoryArchive([row(), row()], options), /duplicate id/);
  assert.throws(() => buildHistoryArchive(Array.from({ length: 1001 }, (_, i) => row(i)), options), /1000 rows/);
  for (const limits of [{ maxRawBytes: 8 * 1024 ** 2 + 1 }, { maxCompressedBytes: 1024 ** 2 + 1 }, { maxRowsPerChunk: 0 }]) {
    assert.throws(() => buildHistoryArchive([], { ...options, ...limits }), /limit/);
  }
  assert.throws(() => buildHistoryArchive([], { ...options, bucket: 'unexpected' }), /options fields/);
  assert.throws(() => buildHistoryArchive([], { ...options, toString: 'unexpected' }), /options fields/);
});

test('rechaza chunks faltantes, corruptos o truncados sin devolver filas parciales', async () => {
  const archive = buildHistoryArchive([row(), row(2)], { ...options, maxRowsPerChunk: 1 });
  const names = [...archive.chunks.keys()];
  await assert.rejects(verifyHistoryArchive(archive.manifest, async name => name === names[1] ? undefined : archive.chunks.get(name)), /missing\/corrupt/);
  const corrupt = Buffer.from(archive.chunks.get(names[1])); corrupt[15] ^= 255;
  await assert.rejects(verifyHistoryArchive(archive.manifest, async name => name === names[1] ? corrupt : archive.chunks.get(name)), /missing\/corrupt/);
  const truncated = archive.chunks.get(names[1]).subarray(0, -3);
  const manifest = structuredClone(archive.manifest);
  Object.assign(manifest.chunks[1], { gzipBytes: truncated.length, gzipSha256: hash(truncated) });
  await assert.rejects(verifyHistoryArchive(manifest, async name => name === names[1] ? truncated : archive.chunks.get(name)));
});

test('valida esquema, proyecto, corte, hashes, conteos, metadata y rutas antes de IO', async () => {
  const archive = buildHistoryArchive([row()], options);
  for (const [key, value] of [['projectId', 'other'], ['cutoff', '2026-07-08T00:00:00.000000Z'], ['snapshotAt', options.cutoff]]) {
    await assert.rejects(verifyHistoryArchive(archive.manifest, fetchFor(archive), { [key]: value }), /mismatch/);
  }
  const changes = [
    manifest => { manifest.schema = 'other'; }, manifest => { manifest.rowCount = 2; },
    manifest => { manifest.chunks[0].name = '../secret'; }, manifest => { manifest.chunks[0].rawSha256 = '0'.repeat(64); },
    manifest => { manifest.chunks[0].firstId = row(99).id; }, manifest => { manifest.rowsSha256 = '0'.repeat(64); },
    manifest => { manifest.chunks[0].productIds = ['other-product']; }, manifest => { manifest.chunks = []; },
  ];
  for (const change of changes) {
    const manifest = structuredClone(archive.manifest); change(manifest);
    await assert.rejects(verifyHistoryArchive(manifest, fetchFor(archive)));
  }
  const manifest = structuredClone(archive.manifest); manifest.chunks[0].name = '../secret';
  let calls = 0;
  await assert.rejects(verifyHistoryArchive(manifest, async () => { calls++; }));
  assert.equal(calls, 0);
});

test('limita descompresión incluso con hash gzip válido para una bomba', async () => {
  const archive = buildHistoryArchive([row()], { ...options, maxRawBytes: 1000 });
  const manifest = structuredClone(archive.manifest);
  const bomb = gzipSync(Buffer.alloc(100_000, 65));
  Object.assign(manifest.chunks[0], { gzipBytes: bomb.length, gzipSha256: hash(bomb) });
  await assert.rejects(verifyHistoryArchive(manifest, async () => bomb), /larger than/);
  await assert.rejects(verifyHistoryArchive(manifest, async () => {
    manifest.limits.maxRawBytes = 1_000_000; return bomb;
  }), /larger than/);
});

test('rechaza contenido alterado aunque se actualicen hashes de chunk', async () => {
  const archive = buildHistoryArchive([row(), row(2)], options);
  for (const transform of [rows => rows.reverse(), rows => [rows[0], rows[0]], rows => [{ ...rows[0], price: '1.234' }, rows[1]]]) {
    const rows = transform([row(), row(2)]);
    const raw = Buffer.from(rows.map(value => JSON.stringify(value) + '\n').join(''));
    const gzip = gzipSync(raw);
    const manifest = structuredClone(archive.manifest);
    Object.assign(manifest.chunks[0], { rawBytes: raw.length, gzipBytes: gzip.length, rawSha256: hash(raw), gzipSha256: hash(gzip) });
    await assert.rejects(verifyHistoryArchive(manifest, async () => gzip));
  }
});

test('selección sólo lee chunks relevantes y distingue verificación parcial de global', async () => {
  const archive = buildHistoryArchive([row(), row(2, { product_id: 'gpu-2' }), row(3, { store_id: 'store-b' })], options);
  const calls = [];
  const result = await readHistoryArchiveSelection(archive.manifest, async name => {
    calls.push(name); return archive.chunks.get(name);
  }, { storeId: 'store-a', date: '2026-07-01', productId: 'gpu-2' }, options);
  assert.deepEqual(result.rows, [row(2, { product_id: 'gpu-2' })]);
  assert.equal(result.verification, 'selected-chunks');
  assert.equal(result.verifiedChunks, 1); assert.equal(result.totalChunks, 2); assert.equal(calls.length, 1);
  const empty = await readHistoryArchiveSelection(archive.manifest, async () => assert.fail('unnecessary fetch'), { productId: 'absent' });
  assert.deepEqual(empty.rows, []); assert.equal(empty.verifiedChunks, 0);
});

test('muestra vacía verificable y calendario bisiesto válido', async () => {
  const empty = buildHistoryArchive([], options);
  assert.deepEqual(await verifyHistoryArchive(empty.manifest, fetchFor(empty)), []);
  assert.doesNotThrow(() => buildHistoryArchive([row(1, { recorded_at: '2024-02-29T23:59:59.999999Z' })], options));
});

test('restaura exactamente el máximo de 1000 filas del piloto', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => row(i + 1));
  const archive = buildHistoryArchive(rows, options);
  assert.equal(archive.manifest.rowCount, 1000);
  assert.equal(archive.manifest.chunks.length, 4);
  assert.deepEqual(await verifyHistoryArchive(archive.manifest, fetchFor(archive), options), rows);
});

test('conserva original_price negativo permitido por origen, pero price sigue no negativo', async () => {
  const rows = [row(1, { original_price: '-999999999999.99' })];
  const archive = buildHistoryArchive(rows, options);
  assert.deepEqual(await verifyHistoryArchive(archive.manifest, fetchFor(archive), options), rows);
  assert.throws(() => buildHistoryArchive([row(1, { price: '-0.01' })], options), /allowed sign/);
});

test('rechaza NDJSON sin newline final aunque coincidan los hashes', async () => {
  const archive = buildHistoryArchive([row()], options);
  const raw = gunzipSync([...archive.chunks.values()][0]).subarray(0, -1);
  const gzip = gzipSync(raw);
  const manifest = structuredClone(archive.manifest);
  Object.assign(manifest.chunks[0], { rawBytes: raw.length, gzipBytes: gzip.length, rawSha256: hash(raw), gzipSha256: hash(gzip) });
  await assert.rejects(verifyHistoryArchive(manifest, async () => gzip), /framing/);
});
