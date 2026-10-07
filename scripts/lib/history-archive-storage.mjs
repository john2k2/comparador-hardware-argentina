// Piloto privado y manual. Objetos inmutables: nunca reemplaza ni elimina originales.
import { createHash } from 'node:crypto';
import { verifyHistoryArchive } from './history-archive.mjs';

export const ARCHIVE_BUCKET = 'catalog-history-archive';
export const PILOT_BYTE_LIMIT = 5 * 1024 * 1024;
const MIME_TYPES = ['application/gzip', 'application/json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const failed = (phase, error) => new Error(`HISTORY_STORAGE_${phase}_${String(error?.statusCode || error?.code || 'FAILED').replace(/[^a-z0-9_-]/gi, '').slice(0, 40)}`);

async function downloadChecked(files, key, expectedBytes) {
  const result = await files.download(key);
  if (result.error || !result.data) throw failed('READBACK', result.error);
  if (!Number.isSafeInteger(result.data.size) || result.data.size !== expectedBytes || result.data.size > 1024 * 1024) throw new Error('HISTORY_STORAGE_DOWNLOAD_BUDGET');
  const bytes = Buffer.from(await result.data.arrayBuffer());
  if (bytes.length !== expectedBytes) throw new Error('HISTORY_STORAGE_DOWNLOAD_BUDGET');
  return bytes;
}

export function archiveObjectPlan({ manifest, chunks }) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  const prefix = `v1/${hash(manifestBytes)}`;
  const objects = manifest.chunks.map(chunk => ({ key: `${prefix}/${chunk.name}`, bytes: chunks.get(chunk.name), contentType: 'application/gzip' }));
  objects.push({ key: `${prefix}/manifest.json`, bytes: manifestBytes, contentType: 'application/json' });
  if (objects.some(obj => !Buffer.isBuffer(obj.bytes) || obj.bytes.length > 1024 * 1024)) throw new Error('HISTORY_STORAGE_FILE_BUDGET');
  const totalBytes = objects.reduce((sum, obj) => sum + obj.bytes.length, 0);
  if (totalBytes > PILOT_BYTE_LIMIT) throw new Error('HISTORY_STORAGE_PILOT_BUDGET');
  return { prefix, objects, totalBytes, manifestSha256: hash(manifestBytes) };
}

// El manifiesto confiable identifica exactamente la entrega que se quiere recuperar.
export async function readRemoteHistoryArchive(storage, trustedManifest, expected) {
  const anchor = Buffer.from(JSON.stringify(trustedManifest) + '\n');
  if (anchor.length > 1024 * 1024) throw new Error('HISTORY_STORAGE_MANIFEST_BUDGET');
  const prefix = `v1/${hash(anchor)}`;
  const files = storage.from(ARCHIVE_BUCKET);
  const bytes = await downloadChecked(files, `${prefix}/manifest.json`, anchor.length);
  if (!bytes.equals(anchor)) throw new Error('HISTORY_STORAGE_MANIFEST_HASH');
  const manifest = JSON.parse(bytes.toString('utf8'));
  const chunks = new Map();
  const rows = await verifyHistoryArchive(manifest, async name => {
    const chunk = manifest.chunks.find(item => item.name === name);
    if (!chunk) throw new Error('HISTORY_STORAGE_UNKNOWN_CHUNK');
    const data = await downloadChecked(files, `${prefix}/${name}`, chunk.gzipBytes);
    chunks.set(name, data); return data;
  }, expected);
  return { manifest, chunks, rows };
}

export async function uploadHistoryArchive(storage, archive, expected, { createBucket = false } = {}) {
  await verifyHistoryArchive(archive.manifest, async name => archive.chunks.get(name), expected);
  const plan = archiveObjectPlan(archive);
  const listed = await storage.listBuckets();
  if (listed.error || !Array.isArray(listed.data)) throw failed('BUCKET_LIST', listed.error);
  let bucket = listed.data.find(item => item.id === ARCHIVE_BUCKET);
  let createdBucket = false;
  if (!bucket) {
    if (!createBucket) throw new Error('HISTORY_STORAGE_BUCKET_NOT_PREPARED');
    const created = await storage.createBucket(ARCHIVE_BUCKET, { public: false, fileSizeLimit: 1024 * 1024, allowedMimeTypes: MIME_TYPES });
    if (created.error) throw failed('BUCKET_CREATE', created.error);
    const checked = await storage.getBucket(ARCHIVE_BUCKET);
    if (checked.error) throw failed('BUCKET_CHECK', checked.error);
    bucket = checked.data; createdBucket = true;
  }
  if (!bucket || bucket.public !== false || Number(bucket.file_size_limit) !== 1024 * 1024 || JSON.stringify([...(bucket.allowed_mime_types || [])].sort()) !== JSON.stringify([...MIME_TYPES].sort())) throw new Error('HISTORY_STORAGE_BUCKET_CONTRACT');
  const files = storage.from(ARCHIVE_BUCKET);
  let uploaded = 0, reused = 0;
  for (const object of plan.objects) {
    // upsert:false protege una ejecución anterior o un resultado ambiguo.
    const put = await files.upload(object.key, object.bytes, { contentType: object.contentType, cacheControl: '3600', upsert: false });
    const restored = await downloadChecked(files, object.key, object.bytes.length);
    if (!restored.equals(object.bytes)) throw new Error('HISTORY_STORAGE_READBACK_MISMATCH');
    if (put.error) reused++; else uploaded++;
  }
  // El manifiesto se escribe al final; éxito sólo tras leer todos los objetos.
  const { rows } = await readRemoteHistoryArchive(storage, archive.manifest, expected);
  return { bucket: ARCHIVE_BUCKET, private: true, prefix: plan.prefix, createdBucket, uploadedObjects: uploaded, reusedObjects: reused, verifiedRows: rows.length, storedBytes: plan.totalBytes, manifestSha256: plan.manifestSha256, originalRowsRemoved: 0, databaseReductionProven: false };
}
