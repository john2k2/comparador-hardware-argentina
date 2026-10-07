// Copia manual en el contenedor privado existente; no crea buckets ni reemplaza objetos.
import { createHash } from 'node:crypto';
import { verifyTelemetryBackup } from './telemetry-backup.mjs';

export const TELEMETRY_BUCKET = 'catalog-history-archive';
export const TELEMETRY_FILE = 'telemetry.json.gz';
const FILE_LIMIT = 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function telemetryManifestPlan(manifest) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  if (manifestBytes.length > FILE_LIMIT || !Number.isSafeInteger(manifest.gzipBytes) || manifest.gzipBytes < 1 || manifest.gzipBytes > FILE_LIMIT) {
    throw new Error('TELEMETRY_STORAGE_MANIFEST_BUDGET');
  }
  const prefix = `telemetry/v1/${sha256(manifestBytes)}`;
  return { prefix, manifestBytes, manifestSha256: sha256(manifestBytes),
    keys: [`${prefix}/${TELEMETRY_FILE}`, `${prefix}/manifest.json`] };
}

export function telemetryObjectPlan(backup) {
  const { prefix, manifestBytes, manifestSha256, keys } = telemetryManifestPlan(backup.manifest);
  const objects = [
    { key: keys[0], bytes: backup.gzipBytes, contentType: 'application/gzip' },
    { key: keys[1], bytes: manifestBytes, contentType: 'application/json' },
  ];
  if (objects.some(item => !Buffer.isBuffer(item.bytes) || item.bytes.length > FILE_LIMIT)) {
    throw new Error('TELEMETRY_STORAGE_FILE_BUDGET');
  }
  return { prefix, objects, manifestSha256, storedBytes: objects.reduce((sum, item) => sum + item.bytes.length, 0) };
}

// Capacidades de red separadas del cliente: sólo este bucket y estos dos objetos.
export function createTelemetryStorageFetch(origin, keys, { allowUpload = false, transport = globalThis.fetch } = {}) {
  if (!Array.isArray(keys) || keys.length !== 2 || new Set(keys).size !== 2
    || keys.some(key => !/^telemetry\/v1\/[a-f0-9]{64}\/(?:manifest\.json|telemetry\.json\.gz)$/.test(key))) {
    throw new Error('TELEMETRY_STORAGE_KEYS');
  }
  const objectPaths = new Set(keys.map(key => `/storage/v1/object/${TELEMETRY_BUCKET}/${key}`));
  return (target, init) => {
    const url = new URL(String(target));
    const method = (init?.method || 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const bucketRead = method === 'GET' && url.pathname === `/storage/v1/bucket/${TELEMETRY_BUCKET}`;
    const objectRead = method === 'GET' && objectPaths.has(url.pathname);
    const objectInsert = allowUpload === true && method === 'POST' && objectPaths.has(url.pathname)
      && headers.get('x-upsert') === 'false' && Buffer.isBuffer(init?.body) && init.body.length <= FILE_LIMIT;
    if (url.origin !== origin || url.username || url.password || url.search || url.hash
      || !(bucketRead || objectRead || objectInsert)) throw new Error('TELEMETRY_STORAGE_NETWORK_FORBIDDEN');
    const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
    return transport(target, { ...init, signal, redirect: 'error' });
  };
}

async function requirePrivateBucket(storage) {
  const response = await storage.getBucket(TELEMETRY_BUCKET);
  const bucket = response?.data;
  if (response?.error || !bucket || bucket.id !== TELEMETRY_BUCKET || bucket.public !== false
    || Number(bucket.file_size_limit) !== FILE_LIMIT
    || JSON.stringify([...(bucket.allowed_mime_types || [])].sort()) !== JSON.stringify(['application/gzip', 'application/json'])) {
    throw new Error('TELEMETRY_STORAGE_BUCKET_CONTRACT');
  }
}

async function downloadSized(files, key, expectedBytes) {
  const result = await files.download(key);
  if (result?.error || !result?.data || result.data.size !== expectedBytes || result.data.size > FILE_LIMIT) {
    throw new Error('TELEMETRY_STORAGE_DOWNLOAD_FAILED');
  }
  const bytes = Buffer.from(await result.data.arrayBuffer());
  if (bytes.length !== expectedBytes) throw new Error('TELEMETRY_STORAGE_DOWNLOAD_FAILED');
  return bytes;
}

async function downloadExact(files, object) {
  const bytes = await downloadSized(files, object.key, object.bytes.length);
  if (!bytes.equals(object.bytes)) throw new Error('TELEMETRY_STORAGE_READBACK_MISMATCH');
  return bytes;
}

export async function downloadTelemetryBackup(storage, trustedManifest, expected) {
  // Recuperar sólo necesita el manifiesto custodiado y la selección, sin gzip local.
  const plan = telemetryManifestPlan(trustedManifest);
  await requirePrivateBucket(storage);
  const files = storage.from(TELEMETRY_BUCKET);
  const manifestBytes = await downloadExact(files, { key: plan.keys[1], bytes: plan.manifestBytes });
  const gzipBytes = await downloadSized(files, plan.keys[0], trustedManifest.gzipBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const rows = verifyTelemetryBackup(manifest, gzipBytes, expected);
  return { manifest, gzipBytes, rows, prefix: plan.prefix, manifestSha256: plan.manifestSha256 };
}

export async function uploadTelemetryBackup(storage, backup, expected) {
  verifyTelemetryBackup(backup.manifest, backup.gzipBytes, expected);
  const plan = telemetryObjectPlan(backup);
  await requirePrivateBucket(storage);
  const files = storage.from(TELEMETRY_BUCKET);
  let uploaded = 0, reused = 0;
  for (const object of plan.objects) {
    // Un error o respuesta perdida sólo se concilia mediante descarga exacta; nunca upsert.
    let response;
    try { response = await files.upload(object.key, object.bytes, { upsert: false, contentType: object.contentType, cacheControl: '3600' }); }
    catch { response = { error: true }; }
    await downloadExact(files, object);
    if (response?.error) reused++; else uploaded++;
  }
  const restored = await downloadTelemetryBackup(storage, backup.manifest, expected);
  return { bucket: TELEMETRY_BUCKET, private: true, prefix: plan.prefix, storedBytes: plan.storedBytes,
    manifestSha256: plan.manifestSha256, uploadedObjects: uploaded, reusedObjects: reused,
    verifiedRows: restored.rows.length, originalRowsRemoved: 0, physicalSavingProven: false };
}
