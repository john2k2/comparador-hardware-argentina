import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHistoryArchive } from './history-archive.mjs';
import { ARCHIVE_BUCKET, readRemoteHistoryArchive, uploadHistoryArchive } from './history-archive-storage.mjs';

const expected = { projectId: 'zyiyziubpcpgoqlkcrie', cutoff: '2026-07-09T00:00:00.000000Z', snapshotAt: '2026-10-07T19:16:07.876892Z' };
const sample = [{ id: '00000000-0000-0000-0000-000000000001', product_id: 'cpu', store_id: 'a', price: '100.00', original_price: null, stock: 'unknown', recorded_at: '2026-03-05T01:51:12.123456Z', offer_url: null }];
const archive = () => buildHistoryArchive(sample, expected);

function fakeStorage() {
  const objects = new Map(), calls = [];
  let bucket;
  const api = {
    objects, calls,
    listBuckets: async () => ({ data: bucket ? [bucket] : [], error: null }),
    createBucket: async (id, options) => {
      calls.push(['create', id, options]);
      bucket = { id, public: options.public, file_size_limit: options.fileSizeLimit, allowed_mime_types: options.allowedMimeTypes };
      return { data: { name: id }, error: null };
    },
    getBucket: async () => ({ data: bucket, error: null }),
    from: id => {
      assert.equal(id, ARCHIVE_BUCKET);
      return {
        upload: async (key, bytes, options) => {
          assert.equal(options.upsert, false);
          calls.push(['upload', key]);
          if (objects.has(key)) return { error: { statusCode: '409' } };
          objects.set(key, Buffer.from(bytes)); return { error: null };
        },
        download: async key => objects.has(key) ? { data: new Blob([objects.get(key)]), error: null } : { data: null, error: { statusCode: '404' } },
      };
    },
    makePublic: () => { bucket.public = true; },
  };
  return api;
}

test('subida privada verifica todos los campos y repetir reutiliza sin reemplazar', async () => {
  const storage = fakeStorage();
  const first = await uploadHistoryArchive(storage, archive(), expected, { createBucket: true });
  assert.equal(first.verifiedRows, 1);
  assert.equal(first.createdBucket, true);
  assert.equal(first.uploadedObjects, 2);
  const second = await uploadHistoryArchive(storage, archive(), expected);
  assert.equal(second.reusedObjects, 2);
  assert.equal(second.uploadedObjects, 0);
  assert.equal(storage.objects.size, 2);
  assert.equal(first.originalRowsRemoved, 0);
  const recovered = await readRemoteHistoryArchive(storage, archive().manifest, expected);
  assert.deepEqual(recovered.rows, sample);
  assert.deepEqual(recovered.chunks, archive().chunks);
});

test('corrupción remota o contenedor público detienen el recibo de éxito', async () => {
  const storage = fakeStorage();
  await uploadHistoryArchive(storage, archive(), expected, { createBucket: true });
  const key = [...storage.objects.keys()].find(name => name.endsWith('.gz'));
  storage.objects.set(key, Buffer.alloc(storage.objects.get(key).length));
  await assert.rejects(uploadHistoryArchive(storage, archive(), expected), /MISMATCH/);
  storage.makePublic();
  await assert.rejects(uploadHistoryArchive(storage, archive(), expected), /BUCKET_CONTRACT/);
});

test('archivo inválido y ausencia de permiso para crear no escriben objetos', async () => {
  const storage = fakeStorage();
  const bad = archive(); bad.manifest.rowCount++;
  await assert.rejects(uploadHistoryArchive(storage, bad, expected, { createBucket: true }));
  assert.equal(storage.calls.length, 0);
  await assert.rejects(uploadHistoryArchive(storage, archive(), expected), /NOT_PREPARED/);
  assert.equal(storage.calls.length, 0);
});

test('una descarga sobredimensionada se rechaza antes de convertir el Blob', async () => {
  const storage = fakeStorage();
  const original = storage.from;
  let converted = 0;
  storage.from = id => ({ ...original(id), download: async () => ({ error: null, data: {
    size: 2 * 1024 * 1024,
    arrayBuffer: async () => { converted++; return new ArrayBuffer(2 * 1024 * 1024); },
  } }) });
  await assert.rejects(uploadHistoryArchive(storage, archive(), expected, { createBucket: true }), /DOWNLOAD_BUDGET/);
  assert.equal(converted, 0);
});
