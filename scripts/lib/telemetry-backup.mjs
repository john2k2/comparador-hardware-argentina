import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

export const TELEMETRY_COLUMNS = Object.freeze(['cache_key', 'scope', 'payload', 'expires_at', 'created_at', 'updated_at']);
const ANCHOR_FIELDS = ['cache_key', 'scope', 'expires_at', 'updated_at'];
const SCOPES = ['operational-endpoint-event', 'operational-store-event'];
const LIMITS = { maxRows: 250, maxGzipBytes: 1024 ** 2, maxRawBytes: 4 * 1024 ** 2 };
const SCHEMA = 'public.api_cache_entries.v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const compareKeys = (a, b) => a.cache_key < b.cache_key ? -1 : a.cache_key > b.cache_key ? 1 : 0;
const encode = rows => Buffer.from(rows.map(row => JSON.stringify(row) + '\n').join(''));

function requireValue(condition, code) {
  if (!condition) throw new Error(`TELEMETRY_BACKUP_${code}`);
}

function exactFields(value, fields, code) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)), code);
}

function text(value, code) {
  requireValue(typeof value === 'string' && value.length > 0 && !value.includes('\0'), code);
  return value;
}

function utc(value) {
  const match = typeof value === 'string'
    && /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/.exec(value);
  requireValue(match, 'UTC_TIMESTAMP');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ''] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireValue(year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour < 24 && minute < 60 && second < 60, 'CALENDAR_TIMESTAMP');
  return `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}.${fraction.padEnd(6, '0')}Z`;
}

function jsonText(value) {
  text(value, 'PAYLOAD_TEXT');
  requireValue(Buffer.byteLength(value) <= LIMITS.maxRawBytes, 'PAYLOAD_SIZE');
  // JSON.parse sólo valida sintaxis: su resultado jamás se serializa ni se utiliza.
  try { JSON.parse(value); } catch { throw new Error('TELEMETRY_BACKUP_PAYLOAD_JSON'); }
  return value;
}

function canonicalAnchor(row) {
  requireValue(SCOPES.includes(row.scope), 'SCOPE');
  return { cache_key: text(row.cache_key, 'KEY'), scope: row.scope, expires_at: utc(row.expires_at), updated_at: utc(row.updated_at) };
}

function canonicalRow(row) {
  exactFields(row, TELEMETRY_COLUMNS, 'ROW_SCHEMA');
  const anchor = canonicalAnchor(row);
  return { cache_key: anchor.cache_key, scope: anchor.scope, payload: jsonText(row.payload),
    expires_at: anchor.expires_at, created_at: utc(row.created_at), updated_at: anchor.updated_at };
}

function canonicalSelection(selection, cutoff) {
  requireValue(Array.isArray(selection) && selection.length >= 1 && selection.length <= LIMITS.maxRows, 'SELECTION_COUNT');
  const anchors = selection.map(row => {
    exactFields(row, ANCHOR_FIELDS, 'ANCHOR_SCHEMA');
    return canonicalAnchor(row);
  }).sort(compareKeys);
  requireValue(new Set(anchors.map(row => row.cache_key)).size === anchors.length, 'DUPLICATE_SELECTION_KEY');
  requireValue(anchors.every(row => row.expires_at < cutoff && row.updated_at <= cutoff), 'SELECTION_CUTOFF');
  return anchors;
}

function configuration(options) {
  exactFields(options, ['projectId', 'cutoff', 'selectionSha256', 'selection'], 'CONFIG_SCHEMA');
  const projectId = text(options.projectId, 'PROJECT');
  const cutoff = utc(options.cutoff);
  requireValue(typeof options.selectionSha256 === 'string' && /^[a-f0-9]{64}$/.test(options.selectionSha256), 'SELECTION_SHA256');
  return { projectId, cutoff, selectionSha256: options.selectionSha256, anchors: canonicalSelection(options.selection, cutoff) };
}

function checkRows(rows, anchors) {
  requireValue(rows.length === anchors.length, 'ROW_COUNT');
  requireValue(new Set(rows.map(row => row.cache_key)).size === rows.length, 'DUPLICATE_ROW_KEY');
  requireValue(isDeepStrictEqual(rows.map(canonicalAnchor), anchors), 'ANCHOR_MISMATCH');
}

// Unquoted vacío es SQL NULL; quoted vacío es texto. Ninguna columna admite SQL NULL.
export function parseTelemetryCsv(csv) {
  requireValue(typeof csv === 'string' && Buffer.byteLength(csv) <= 2 * LIMITS.maxRawBytes, 'CSV_SIZE');
  const records = [];
  let record = [], cell = '', quoted = false, inside = false, closed = false;
  const finishCell = () => {
    record.push(cell === '' && !quoted ? null : cell);
    cell = ''; quoted = false; closed = false;
  };
  const finishRecord = () => { finishCell(); records.push(record); record = []; };
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (inside) {
      if (char !== '"') cell += char;
      else if (csv[index + 1] === '"') { cell += '"'; index++; }
      else { inside = false; closed = true; }
    } else if (char === '"') {
      requireValue(cell === '' && !quoted && !closed, 'CSV_QUOTE'); quoted = true; inside = true;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') index++;
      finishRecord();
    } else { requireValue(!closed, 'CSV_TRAILING_CELL'); cell += char; }
  }
  requireValue(!inside, 'CSV_TRUNCATED');
  if (record.length || cell !== '' || quoted) finishRecord();
  requireValue(isDeepStrictEqual(records.shift(), TELEMETRY_COLUMNS), 'CSV_SCHEMA');
  requireValue(records.length >= 1 && records.length <= LIMITS.maxRows, 'CSV_COUNT');
  return records.map(values => {
    requireValue(values.length === TELEMETRY_COLUMNS.length, 'CSV_COLUMNS');
    return canonicalRow(Object.fromEntries(TELEMETRY_COLUMNS.map((column, index) => [column, values[index]])));
  });
}

export function buildTelemetryBackup(inputRows, options) {
  const config = configuration(options);
  requireValue(Array.isArray(inputRows) && inputRows.length >= 1 && inputRows.length <= LIMITS.maxRows, 'ROW_COUNT');
  let accumulatedBytes = 0;
  const rows = inputRows.map(row => {
    const canonical = canonicalRow(row);
    accumulatedBytes += encode([canonical]).length;
    requireValue(accumulatedBytes <= LIMITS.maxRawBytes, 'RAW_SIZE');
    return canonical;
  }).sort(compareKeys);
  checkRows(rows, config.anchors);
  const raw = encode(rows);
  const gzipBytes = gzipSync(raw, { level: 9 });
  requireValue(gzipBytes.length <= LIMITS.maxGzipBytes, 'GZIP_SIZE');
  return { manifest: {
    version: 1, schema: SCHEMA, projectId: config.projectId, cutoff: config.cutoff,
    selectionSha256: config.selectionSha256, anchorsSha256: hash(encode(config.anchors)), rowCount: rows.length,
    scopes: [...new Set(rows.map(row => row.scope))].sort(), limits: { ...LIMITS },
    rawBytes: raw.length, gzipBytes: gzipBytes.length, rawSha256: hash(raw), gzipSha256: hash(gzipBytes),
  }, gzipBytes };
}

export function verifyTelemetryBackup(manifest, gzipBytes, expected) {
  const config = configuration(expected);
  exactFields(manifest, ['version', 'schema', 'projectId', 'cutoff', 'selectionSha256', 'anchorsSha256', 'rowCount',
    'scopes', 'limits', 'rawBytes', 'gzipBytes', 'rawSha256', 'gzipSha256'], 'MANIFEST_SCHEMA');
  requireValue(manifest.version === 1 && manifest.schema === SCHEMA && isDeepStrictEqual(manifest.limits, LIMITS), 'MANIFEST_VERSION_LIMITS');
  requireValue(manifest.projectId === config.projectId && manifest.cutoff === config.cutoff
    && manifest.selectionSha256 === config.selectionSha256 && manifest.anchorsSha256 === hash(encode(config.anchors)), 'MANIFEST_ANCHOR');
  requireValue(manifest.rowCount === config.anchors.length, 'MANIFEST_COUNT');
  const expectedScopes = [...new Set(config.anchors.map(row => row.scope))].sort();
  requireValue(isDeepStrictEqual(manifest.scopes, expectedScopes), 'MANIFEST_SCOPES');
  for (const [field, maximum] of [['rawBytes', LIMITS.maxRawBytes], ['gzipBytes', LIMITS.maxGzipBytes]]) {
    requireValue(Number.isSafeInteger(manifest[field]) && manifest[field] > 0 && manifest[field] <= maximum, 'MANIFEST_BYTES');
  }
  requireValue([manifest.rawSha256, manifest.gzipSha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)), 'MANIFEST_HASH');
  requireValue(Buffer.isBuffer(gzipBytes) && gzipBytes.length === manifest.gzipBytes && hash(gzipBytes) === manifest.gzipSha256, 'GZIP_INTEGRITY');
  let raw;
  try { raw = gunzipSync(gzipBytes, { maxOutputLength: LIMITS.maxRawBytes }); }
  catch { throw new Error('TELEMETRY_BACKUP_GZIP_INVALID'); }
  requireValue(raw.length === manifest.rawBytes && hash(raw) === manifest.rawSha256, 'RAW_INTEGRITY');
  const lines = raw.toString('utf8').split('\n');
  requireValue(lines.pop() === '' && lines.length === manifest.rowCount, 'NDJSON_FRAMING');
  const rows = lines.map(line => {
    let row;
    try { row = JSON.parse(line); } catch { throw new Error('TELEMETRY_BACKUP_NDJSON_INVALID'); }
    return canonicalRow(row);
  });
  requireValue(encode(rows).equals(raw) && isDeepStrictEqual(rows, [...rows].sort(compareKeys)), 'NONCANONICAL_ROWS');
  checkRows(rows, config.anchors);
  return rows;
}
