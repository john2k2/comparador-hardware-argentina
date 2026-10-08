// Capacidades mínimas del runner: nunca DELETE directo, redirects, upsert ni reintento mutante.
import { createHash } from 'node:crypto';
import { createTelemetryStorageFetch, TELEMETRY_BUCKET, uploadTelemetryBackup, downloadTelemetryBackup, telemetryManifestPlan } from './telemetry-backup-storage.mjs';
import { TELEMETRY_METADATA_FIELDS, TELEMETRY_SCOPES, telemetryUtc } from './telemetry-maintenance.mjs';
import { decodeTelemetrySelection } from './telemetry-selection-codec.mjs';

export const TELEMETRY_SELECT_RPC = 'select_backed_telemetry_candidates';
export const TELEMETRY_RETIRE_RPC = 'retire_backed_telemetry';
const FILE_LIMIT = 1024 ** 2;
const requireValue = (condition, code) => { if (!condition) throw new Error(`TELEMETRY_MAINTENANCE_NETWORK_${code}`); };
const hash = value => createHash('sha256').update(value).digest('hex');
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function onceTransport(transport, signal, repeatableReadOnlyPath = null) {
  const attempted = new Set();
  return (target, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const readOnlySelector = repeatableReadOnlyPath !== null && new URL(String(target)).pathname === repeatableReadOnlyPath;
    if (method === 'POST' && !readOnlySelector) {
      const identity = String(target) + ':' + hash(init.body);
      requireValue(!attempted.has(identity), 'POST_ALREADY_ATTEMPTED');
      attempted.add(identity); // Incluso si el transporte pierde la respuesta, no volver a mutar.
    }
    const signals = [AbortSignal.timeout(15000), signal, init.signal].filter(Boolean);
    const requestSignal = AbortSignal.any(signals);
    requestSignal.throwIfAborted();
    return transport(target, { ...init, signal: requestSignal, redirect: 'error' });
  };
}

export function createTelemetryMaintenanceDataFetch(origin, { allowRetire = false, transport = globalThis.fetch, signal } = {}) {
  // El selector es POST por el protocolo RPC, pero debe ejecutarse una vez por lote.
  // Ruta, origen y cuerpo se validan antes de llegar a esta excepción de lectura.
  const send = onceTransport(transport, signal, `/rest/v1/rpc/${TELEMETRY_SELECT_RPC}`);
  return (target, init = {}) => {
    const url = new URL(String(target));
    const method = (init.method || 'GET').toUpperCase();
    requireValue(url.origin === origin && !url.username && !url.password && !url.hash, 'ORIGIN');
    if (method === 'GET' && url.pathname === '/rest/v1/api_cache_entries') {
      const allowed = ['select', 'scope', 'expires_at', 'updated_at', 'order', 'limit', 'cache_key'];
      requireValue([...url.searchParams.keys()].every(key => allowed.includes(key))
        && allowed.every(key => url.searchParams.getAll(key).length <= 1)
        && url.searchParams.get('select') === TELEMETRY_METADATA_FIELDS.join(','), 'METADATA_QUERY');
      const limit = Number(url.searchParams.get('limit'));
      requireValue(Number.isSafeInteger(limit) && limit >= 1 && limit <= 250, 'LIMIT');
      const byKeys = url.searchParams.get('cache_key');
      if (byKeys !== null) {
        requireValue(byKeys.startsWith('in.(') && byKeys.endsWith(')')
          && ['scope', 'expires_at', 'updated_at'].every(key => !url.searchParams.has(key)), 'RECONCILE_QUERY');
      } else {
        requireValue(url.searchParams.get('scope') === `in.(${TELEMETRY_SCOPES.join(',')})`, 'SCOPES');
        const expires = url.searchParams.get('expires_at');
        const updated = url.searchParams.get('updated_at');
        requireValue(expires?.startsWith('lt.') && updated?.startsWith('lte.')
          && telemetryUtc(expires.slice(3)) === telemetryUtc(updated.slice(4)), 'CUTOFF');
      }
    } else {
      requireValue(allowRetire === true && method === 'POST' && !url.search
        && [TELEMETRY_SELECT_RPC, TELEMETRY_RETIRE_RPC].some(name => url.pathname === `/rest/v1/rpc/${name}`)
        && typeof init.body === 'string' && Buffer.byteLength(init.body) <= 4 * FILE_LIMIT + 1024, 'RPC');
      let body;
      try { body = JSON.parse(init.body); } catch { throw new Error('TELEMETRY_MAINTENANCE_NETWORK_BODY'); }
      telemetryUtc(body?.p_cutoff);
      if (url.pathname.endsWith('/' + TELEMETRY_SELECT_RPC)) {
        requireValue(exact(body, ['p_cutoff', 'p_limit']) && Number.isSafeInteger(body.p_limit) && body.p_limit >= 1 && body.p_limit <= 250, 'SELECT_BODY');
      } else {
        const fields = ['cache_key', 'scope', 'payload_text', 'expires_at', 'created_at', 'updated_at'];
        requireValue(exact(body, ['p_cutoff', 'p_snapshot']) && Array.isArray(body.p_snapshot)
          && body.p_snapshot.length >= 1 && body.p_snapshot.length <= 250
          && Buffer.byteLength(JSON.stringify(body.p_snapshot)) <= 4 * FILE_LIMIT
          && body.p_snapshot.every(row => exact(row, fields) && TELEMETRY_SCOPES.includes(row.scope)
            && typeof row.payload_text === 'string' && typeof row.cache_key === 'string'), 'RETIRE_BODY');
      }
    }
    return send(target, init);
  };
}

export function createTelemetryMaintenanceStorageFetch(origin, keys, { allowUpload = false, transport = globalThis.fetch, signal } = {}) {
  requireValue(Array.isArray(keys) && [3, 4].includes(keys.length) && new Set(keys).size === keys.length, 'STORAGE_KEYS');
  const selectionKeys = keys.filter(key => /^telemetry\/v1\/[a-f0-9]{64}\/selection\.json(?:\.gz)?$/.test(key));
  const prefix = selectionKeys[0]?.slice(0, selectionKeys[0].lastIndexOf('/') + 1);
  requireValue(selectionKeys.length === keys.length - 2 && prefix && keys.every(key => key.startsWith(prefix))
    && (keys.length === 3 || allowUpload === false), 'STORAGE_PREFIX');
  const send = onceTransport(transport, signal);
  const oldGuard = createTelemetryStorageFetch(origin, keys.filter(key => !selectionKeys.includes(key)), { allowUpload, transport: send });
  const selectionPaths = new Set(selectionKeys.map(key => `/storage/v1/object/${TELEMETRY_BUCKET}/${key}`));
  return (target, init = {}) => {
    const url = new URL(String(target));
    if (!selectionPaths.has(url.pathname)) return oldGuard(target, init);
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const insert = allowUpload === true && method === 'POST' && headers.get('x-upsert') === 'false'
      && url.pathname.endsWith('/selection.json.gz') && headers.get('content-type') === 'application/gzip'
      && Buffer.isBuffer(init.body) && init.body.length > 0 && init.body.length <= FILE_LIMIT;
    requireValue(url.origin === origin && !url.username && !url.password && !url.search && !url.hash
      && (method === 'GET' || insert), 'SELECTION_OBJECT');
    return send(target, init);
  };
}

export async function readTelemetryJson(response, maxBytes = 8 * FILE_LIMIT) {
  requireValue(response?.ok && response.body, 'HTTP');
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      requireValue(size <= maxBytes, 'RESPONSE_BYTES');
      chunks.push(Buffer.from(part.value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function storeTelemetryMaintenanceArchive(storage, archive) {
  // El helper existente valida el bucket y descarga los otros dos objetos antes de continuar.
  await uploadTelemetryBackup(storage, archive.backup, archive.expected);
  const files = storage.from(TELEMETRY_BUCKET);
  try { await files.upload(archive.selectionKey, archive.selectionGzipBytes, { upsert: false, contentType: 'application/gzip', cacheControl: '3600' }); }
  catch { /* Sólo una descarga exacta permite conciliar una respuesta perdida. */ }
  const response = await files.download(archive.selectionKey);
  requireValue(!response?.error && response?.data?.size === archive.selectionGzipBytes.length && response.data.size <= FILE_LIMIT, 'SELECTION_DOWNLOAD');
  const selectionGzipBytes = Buffer.from(await response.data.arrayBuffer());
  requireValue(selectionGzipBytes.equals(archive.selectionGzipBytes), 'SELECTION_READBACK');
  const selectionBytes = decodeTelemetrySelection(selectionGzipBytes);
  requireValue(selectionBytes.equals(archive.selectionBytes) && hash(selectionBytes) === archive.expected.selectionSha256, 'SELECTION_READBACK');
  const downloaded = await downloadTelemetryBackup(storage, archive.backup.manifest, archive.expected);
  return { manifest: downloaded.manifest, gzipBytes: downloaded.gzipBytes, selectionBytes };
}

// La custodia de sólo manifestSha256 permite recuperar selección+manifiesto privados.
export function telemetryMaintenanceObjectKeys(archive) {
  return [...telemetryManifestPlan(archive.backup.manifest).keys, archive.selectionKey];
}

// Recuperación permite cuatro rutas exactas de lectura; ninguna admite subida.
export function telemetryMaintenanceRecoveryObjectKeys(manifestSha256) {
  requireValue(typeof manifestSha256 === 'string' && /^[a-f0-9]{64}$/.test(manifestSha256), 'TRUSTED_HASH');
  const prefix = `telemetry/v1/${manifestSha256}`;
  return ['telemetry.json.gz', 'manifest.json', 'selection.json.gz', 'selection.json'].map(name => `${prefix}/${name}`);
}

export async function downloadTelemetryMaintenanceArchive(storage, manifestSha256, projectId) {
  requireValue(typeof manifestSha256 === 'string' && /^[a-f0-9]{64}$/.test(manifestSha256), 'TRUSTED_HASH');
  const prefix = `telemetry/v1/${manifestSha256}`;
  const bucketResponse = await storage.getBucket(TELEMETRY_BUCKET);
  const bucket = bucketResponse?.data;
  requireValue(!bucketResponse?.error && bucket?.id === TELEMETRY_BUCKET && bucket.public === false
    && Number(bucket.file_size_limit) === FILE_LIMIT
    && JSON.stringify([...(bucket.allowed_mime_types || [])].sort()) === JSON.stringify(['application/gzip', 'application/json']), 'RECOVERY_BUCKET');
  const files = storage.from(TELEMETRY_BUCKET);
  async function bytesFor(name, response) {
    if (arguments.length === 1) response = await files.download(`${prefix}/${name}`);
    requireValue(!response?.error && response?.data?.size > 0 && response.data.size <= FILE_LIMIT, 'RECOVERY_DOWNLOAD');
    const bytes = Buffer.from(await response.data.arrayBuffer());
    requireValue(bytes.length === response.data.size, 'RECOVERY_BYTES');
    return bytes;
  }
  const manifestBytes = await bytesFor('manifest.json');
  requireValue(hash(manifestBytes) === manifestSha256, 'RECOVERY_MANIFEST_HASH');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const compressedResponse = await files.download(`${prefix}/selection.json.gz`);
  // Sólo el status HTTP 404 explícito, sin datos, prueba ausencia. Un statusCode
  // aislado, timeout, corrupción o respuesta contradictoria nunca habilita fallback.
  const downloadError = compressedResponse?.error;
  // storage-js conserva la Response original en StorageUnknownError para descargas.
  const originalResponse = downloadError?.name === 'StorageUnknownError' && downloadError.originalError instanceof Response
    ? downloadError.originalError : null;
  const missingCompressed = compressedResponse?.data == null
    && (downloadError?.status === 404 || (originalResponse?.status === 404 && originalResponse.ok === false));
  const selectionBytes = missingCompressed ? await bytesFor('selection.json')
    : decodeTelemetrySelection(await bytesFor('selection.json.gz', compressedResponse));
  requireValue(hash(selectionBytes) === manifest.selectionSha256, 'RECOVERY_SELECTION_HASH');
  const selection = JSON.parse(selectionBytes.toString('utf8'));
  requireValue(exact(selection, ['projectId', 'cutoff', 'rows']) && selection.projectId === projectId
    && selection.cutoff === manifest.cutoff, 'RECOVERY_SELECTION');
  const expected = { projectId, cutoff: selection.cutoff, selectionSha256: manifest.selectionSha256, selection: selection.rows };
  // El helper revalida que el contenedor sea privado y verifica la copia completa.
  const downloaded = await downloadTelemetryBackup(storage, manifest, expected);
  requireValue(downloaded.manifestSha256 === manifestSha256, 'RECOVERY_CANONICAL_MANIFEST');
  return { ...downloaded, selectionBytes, expected };
}
