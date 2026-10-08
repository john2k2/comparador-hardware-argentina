// Núcleo sin clientes ni red: sólo habilita retiro después de verificar custodia remota.
import { createHash } from 'node:crypto';
import { buildTelemetryBackup, verifyTelemetryBackup } from './telemetry-backup.mjs';
import { telemetryObjectPlan } from './telemetry-backup-storage.mjs';
import { encodeTelemetrySelection } from './telemetry-selection-codec.mjs';

export const TELEMETRY_MAINTENANCE_LIMITS = Object.freeze({ batchSize: 250, maxBatches: 4, deadlineMs: 120000, maxStoredBytes: 5 * 1024 ** 2 });
export const TELEMETRY_METADATA_FIELDS = Object.freeze(['cache_key', 'scope', 'expires_at', 'updated_at']);
export const TELEMETRY_SCOPES = Object.freeze(['operational-endpoint-event', 'operational-store-event']);
const SNAPSHOT_FIELDS = ['cache_key', 'scope', 'payload_text', 'expires_at', 'created_at', 'updated_at'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, code) => { if (!condition) throw new Error(`TELEMETRY_MAINTENANCE_${code}`); };
const exact = (value, fields, code) => requireValue(value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)), code);

export function telemetryUtc(value) {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
  requireValue(match, 'UTC');
  const time = Date.parse(match[1] + 'Z');
  requireValue(Number(match[1].slice(0, 4)) > 0 && Number.isFinite(time)
    && new Date(time).toISOString().slice(0, 19) === match[1], 'CALENDAR');
  return `${match[1]}.${(match[2] || '').padEnd(6, '0')}Z`;
}

export function validateTelemetryMaintenanceOptions(options) {
  requireValue(options && typeof options === 'object' && !Array.isArray(options), 'OPTIONS');
  requireValue(Object.keys(options).every(key => ['mode', 'projectId', 'cutoff', 'now', 'approvalId', ...Object.keys(TELEMETRY_MAINTENANCE_LIMITS)].includes(key)), 'OPTION');
  const config = { mode: 'inspect', batchSize: 250, maxBatches: 1, deadlineMs: 120000, maxStoredBytes: 5 * 1024 ** 2, ...options };
  requireValue(['inspect', 'archive-retire'].includes(config.mode), 'MODE');
  requireValue(typeof config.projectId === 'string' && /^[a-z0-9-]{1,80}$/.test(config.projectId), 'PROJECT');
  config.cutoff = telemetryUtc(config.cutoff);
  const now = telemetryUtc(config.now);
  const latest = telemetryUtc(new Date(Date.parse(now) - 5 * 60 * 1000).toISOString());
  requireValue(config.cutoff <= latest, 'CUTOFF');
  for (const [key, maximum] of Object.entries(TELEMETRY_MAINTENANCE_LIMITS)) {
    requireValue(Number.isSafeInteger(config[key]) && config[key] >= 1 && config[key] <= maximum, 'LIMIT');
  }
  if (config.mode === 'archive-retire') requireValue(typeof config.approvalId === 'string' && config.approvalId.trim().length > 0, 'APPROVAL');
  return config;
}

function metadataRows(rows, limit, cutoff, eligible) {
  requireValue(Array.isArray(rows) && rows.length <= limit, 'METADATA_COUNT');
  const keys = new Set();
  return rows.map(row => {
    exact(row, TELEMETRY_METADATA_FIELDS, 'METADATA_FIELDS');
    requireValue(typeof row.cache_key === 'string' && row.cache_key.length > 0 && !row.cache_key.includes('\0') && !keys.has(row.cache_key), 'KEY');
    keys.add(row.cache_key);
    requireValue(typeof row.scope === 'string', 'SCOPE');
    const anchor = { cache_key: row.cache_key, scope: row.scope, expires_at: telemetryUtc(row.expires_at), updated_at: telemetryUtc(row.updated_at) };
    if (eligible) requireValue(TELEMETRY_SCOPES.includes(row.scope) && anchor.expires_at < cutoff && anchor.updated_at <= cutoff, 'ELIGIBILITY');
    return anchor;
  });
}

export function buildTelemetryMaintenanceArchive(snapshot, config) {
  requireValue(Array.isArray(snapshot) && snapshot.length > 0 && snapshot.length <= config.batchSize, 'SNAPSHOT_COUNT');
  const rows = snapshot.map(row => {
    exact(row, SNAPSHOT_FIELDS, 'SNAPSHOT_FIELDS');
    return { cache_key: row.cache_key, scope: row.scope, payload: row.payload_text,
      expires_at: row.expires_at, created_at: row.created_at, updated_at: row.updated_at };
  });
  const selection = metadataRows(rows.map(({ cache_key, scope, expires_at, updated_at }) => ({ cache_key, scope, expires_at, updated_at })), config.batchSize, config.cutoff, true)
    .sort((a, b) => a.cache_key < b.cache_key ? -1 : a.cache_key > b.cache_key ? 1 : 0);
  const selectionBytes = Buffer.from(JSON.stringify({ projectId: config.projectId, cutoff: config.cutoff, rows: selection }) + '\n');
  requireValue(selectionBytes.length <= 1024 ** 2, 'SELECTION_BYTES');
  const selectionGzipBytes = encodeTelemetrySelection(selectionBytes);
  const expected = { projectId: config.projectId, cutoff: config.cutoff, selectionSha256: hash(selectionBytes), selection };
  const backup = buildTelemetryBackup(rows, expected);
  const verified = verifyTelemetryBackup(backup.manifest, backup.gzipBytes, expected);
  const plan = telemetryObjectPlan(backup);
  const canonicalSnapshot = verified.map(({ payload, ...row }) => ({ cache_key: row.cache_key, scope: row.scope, payload_text: payload,
    expires_at: row.expires_at, created_at: row.created_at, updated_at: row.updated_at }));
  requireValue(Buffer.byteLength(JSON.stringify(canonicalSnapshot)) <= 4 * 1024 ** 2, 'SNAPSHOT_BYTES');
  return { backup, expected, selectionBytes, selectionGzipBytes, selectionKey: `${plan.prefix}/selection.json.gz`, snapshot: canonicalSnapshot,
    storedBytes: plan.storedBytes + selectionGzipBytes.length, manifestSha256: plan.manifestSha256 };
}

function acknowledgedKeys(ack, snapshot) {
  exact(ack, ['selected', 'removed', 'changed_or_missing', 'removed_keys'], 'ACK_FIELDS');
  for (const field of ['selected', 'removed', 'changed_or_missing']) requireValue(Number.isSafeInteger(ack[field]) && ack[field] >= 0, 'ACK_COUNT');
  const selected = new Set(snapshot.map(row => row.cache_key));
  requireValue(ack.selected === snapshot.length && Array.isArray(ack.removed_keys)
    && ack.removed === ack.removed_keys.length && ack.removed + ack.changed_or_missing === ack.selected, 'ACK_COUNT');
  requireValue(new Set(ack.removed_keys).size === ack.removed_keys.length && ack.removed_keys.every(key => selected.has(key)), 'ACK_KEYS');
  return new Set(ack.removed_keys);
}

export async function processTelemetryMaintenance(callbacks, options, clock = () => performance.now()) {
  const config = validateTelemetryMaintenanceOptions(options);
  const start = clock();
  const result = { version: 1, mode: config.mode, cutoff: config.cutoff, success: false, stopped: false, reason: null,
    selected: 0, archived: 0, removed: 0, changedOrMissing: 0, unknown: 0, absentAfterUnknown: 0,
    storedBytes: 0, batches: [], globallyComplete: false, physicalSavingProven: false };
  const seen = new Set();
  const remaining = () => config.deadlineMs - (clock() - start);
  const checkDeadline = (minimum = 0) => requireValue(remaining() > minimum, 'DEADLINE');
  const stop = reason => ({ ...result, stopped: true, reason });
  const reconcile = async snapshot => {
    checkDeadline();
    const rows = metadataRows(await callbacks.reconcileMetadata(snapshot.map(row => row.cache_key)), snapshot.length, config.cutoff, false);
    const selected = new Set(snapshot.map(row => row.cache_key));
    requireValue(rows.every(row => selected.has(row.cache_key)), 'RECONCILE_KEYS');
    return new Map(rows.map(row => [row.cache_key, row]));
  };
  try {
    checkDeadline();
    if (config.mode === 'inspect') {
      const rows = metadataRows(await callbacks.inspectMetadata(config.cutoff, config.batchSize), config.batchSize, config.cutoff, true);
      checkDeadline();
      return { ...result, selected: rows.length, success: true };
    }
    for (let batch = 0; batch < config.maxBatches; batch++) {
      checkDeadline();
      const selected = await callbacks.selectSnapshot(config.cutoff, config.batchSize);
      checkDeadline();
      requireValue(Array.isArray(selected), 'SNAPSHOT_COUNT');
      if (selected.length === 0) return { ...result, success: true };
      const archive = buildTelemetryMaintenanceArchive(selected, config);
      requireValue(archive.snapshot.every(row => !seen.has(row.cache_key)), 'REPEATED_SELECTION');
      archive.snapshot.forEach(row => seen.add(row.cache_key));
      result.selected += archive.snapshot.length;
      requireValue(result.storedBytes + archive.storedBytes <= config.maxStoredBytes, 'STORAGE_BUDGET');
      const downloaded = await callbacks.storeArchive({ ...archive, snapshot: structuredClone(archive.snapshot),
        backup: { manifest: structuredClone(archive.backup.manifest), gzipBytes: Buffer.from(archive.backup.gzipBytes) },
        expected: structuredClone(archive.expected), selectionBytes: Buffer.from(archive.selectionBytes),
        selectionGzipBytes: Buffer.from(archive.selectionGzipBytes) });
      checkDeadline();
      requireValue(Buffer.isBuffer(downloaded?.selectionBytes) && downloaded.selectionBytes.equals(archive.selectionBytes), 'SELECTION_READBACK');
      verifyTelemetryBackup(downloaded.manifest, downloaded.gzipBytes, archive.expected);
      requireValue(JSON.stringify(downloaded.manifest) === JSON.stringify(archive.backup.manifest), 'MANIFEST_READBACK');
      result.archived += archive.snapshot.length;
      result.storedBytes += archive.storedBytes;
      const receipt = { selected: archive.snapshot.length, removed: 0, changedOrMissing: 0, unknown: 0,
        storedBytes: archive.storedBytes, manifestSha256: archive.manifestSha256, selectionSha256: archive.expected.selectionSha256 };
      result.batches.push(receipt);
      checkDeadline(30000);
      let keys;
      try {
        keys = acknowledgedKeys(await callbacks.retireSnapshot(config.cutoff, structuredClone(archive.snapshot)), archive.snapshot);
      } catch {
        result.unknown += archive.snapshot.length;
        receipt.unknown = archive.snapshot.length;
        try { result.absentAfterUnknown += archive.snapshot.length - (await reconcile(archive.snapshot)).size; } catch { /* Sin atribuir retiro ni reintentar. */ }
        return stop('TELEMETRY_MAINTENANCE_MUTATION_UNKNOWN');
      }
      try {
        const current = await reconcile(archive.snapshot);
        // Una clave no reconocida puede haber cambiado o faltar desde antes del DELETE.
        // Su ausencia nunca acredita retiro propio; sólo las claves del ACK deben faltar.
        requireValue([...keys].every(key => !current.has(key)), 'RECONCILE_ACK');
      } catch {
        result.unknown += archive.snapshot.length;
        receipt.unknown = archive.snapshot.length;
        return stop('TELEMETRY_MAINTENANCE_RECONCILE_UNKNOWN');
      }
      receipt.removed = keys.size;
      receipt.changedOrMissing = archive.snapshot.length - keys.size;
      result.removed += receipt.removed;
      result.changedOrMissing += receipt.changedOrMissing;
      if (archive.snapshot.length < config.batchSize) return { ...result, success: true };
    }
    return { ...result, success: true };
  } catch (error) {
    const reason = error instanceof Error && /^TELEMETRY_(?:MAINTENANCE|BACKUP)_[A-Z_]+$/.test(error.message) ? error.message : 'TELEMETRY_MAINTENANCE_STAGE_FAILED';
    return stop(reason);
  }
}
