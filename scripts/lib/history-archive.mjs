import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

const SCHEMA = 'public.price_history.v1';
const MAX_ROWS = 1000;
const HARD_LIMITS = { maxRowsPerChunk: MAX_ROWS, maxCompressedBytes: 1024 ** 2, maxRawBytes: 8 * 1024 ** 2 };
const DEFAULT_LIMITS = { ...HARD_LIMITS, maxRowsPerChunk: 250 };
const SOURCE = { kind: 'bounded-paginated-sample', consistency: 'non-transactional', maxRows: MAX_ROWS };
const COLUMNS = ['id', 'product_id', 'store_id', 'price', 'original_price', 'stock', 'recorded_at', 'offer_url'];
const STOCK = new Set(['in-stock', 'low-stock', 'out-of-stock', 'unknown']);
const digest = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const orderRows = (a, b) => compare(a.recorded_at, b.recorded_at) || compare(a.id, b.id);
const encode = rows => Buffer.from(rows.map(row => JSON.stringify(row) + '\n').join(''));
const same = isDeepStrictEqual;

function requireValue(condition, message) {
  if (!condition) throw new Error(`History archive: ${message}`);
}

function exactKeys(value, keys, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && same(Object.keys(value).sort(), [...keys].sort()), `${label} fields`);
}

function timestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/.exec(value);
  requireValue(match, 'UTC timestamp must retain six fractional digits');
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireValue(year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour < 24 && minute < 60 && second < 60, 'invalid calendar timestamp');
  return value;
}

function text(value, label) {
  requireValue(typeof value === 'string' && value.length > 0 && !value.includes('\0'), `${label} text`);
  return value;
}

function decimal(value, allowNegative = false) {
  const match = typeof value === 'string' && /^(-?)(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(value);
  requireValue(match && (allowNegative || !match[1]), 'NUMERIC(14,2) must be exact decimal text with an allowed sign');
  return `${match[1]}${match[2]}.${(match[3] ?? '').padEnd(2, '0')}`;
}

function canonicalRow(row) {
  exactKeys(row, COLUMNS, 'row');
  requireValue(typeof row.id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id), 'id UUID');
  requireValue(STOCK.has(row.stock), 'stock enum');
  requireValue(row.offer_url === null || (typeof row.offer_url === 'string' && !row.offer_url.includes('\0')), 'offer_url null or text');
  return {
    id: row.id.toLowerCase(), product_id: text(row.product_id, 'product_id'), store_id: text(row.store_id, 'store_id'),
    price: decimal(row.price), original_price: row.original_price === null ? null : decimal(row.original_price, true),
    stock: row.stock, recorded_at: timestamp(row.recorded_at), offer_url: row.offer_url,
  };
}

function limitsFor(limits) {
  exactKeys(limits, Object.keys(HARD_LIMITS), 'limits');
  for (const [key, maximum] of Object.entries(HARD_LIMITS)) {
    requireValue(Number.isSafeInteger(limits[key]) && limits[key] > 0 && limits[key] <= maximum, `${key} limit`);
  }
  return limits;
}

function chunkName(date, storeId, index) {
  return `${date}-${digest(storeId)}-${String(index).padStart(6, '0')}.ndjson.gz`;
}

function describeChunk(rows, raw, gzip, name) {
  return {
    name, storeId: rows[0].store_id, date: rows[0].recorded_at.slice(0, 10), rowCount: rows.length,
    rawBytes: raw.length, gzipBytes: gzip.length, rawSha256: digest(raw), gzipSha256: digest(gzip),
    firstRecordedAt: rows[0].recorded_at, lastRecordedAt: rows.at(-1).recorded_at,
    firstId: rows[0].id, lastId: rows.at(-1).id,
    productIds: [...new Set(rows.map(row => row.product_id))].sort(compare),
  };
}

// El codec no hace IO ni afirma que una extracción paginada sea un snapshot transaccional.
export function buildHistoryArchive(inputRows, options) {
  exactKeys(options, ['projectId', 'cutoff', 'snapshotAt', ...Object.keys(options).filter(key => Object.hasOwn(HARD_LIMITS, key))], 'options');
  const { projectId, cutoff, snapshotAt } = options;
  text(projectId, 'projectId'); timestamp(cutoff); timestamp(snapshotAt);
  requireValue(cutoff <= snapshotAt, 'cutoff after snapshotAt');
  requireValue(Array.isArray(inputRows) && inputRows.length <= MAX_ROWS, 'sample exceeds 1000 rows');
  const limits = limitsFor(Object.fromEntries(Object.keys(HARD_LIMITS).map(key => [key, options[key] ?? DEFAULT_LIMITS[key]])));
  const rows = inputRows.map(canonicalRow).sort(orderRows);
  const ids = new Set();
  for (const row of rows) {
    requireValue(!ids.has(row.id), 'duplicate id'); ids.add(row.id);
    requireValue(row.recorded_at < cutoff, 'row outside exclusive cutoff');
  }
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.recorded_at.slice(0, 10), row.store_id]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const chunks = new Map();
  const descriptors = [];
  for (const key of [...groups.keys()].sort(compare)) {
    const [date, storeId] = JSON.parse(key);
    let part = [];
    let index = 0;
    const flush = () => {
      const raw = encode(part);
      const gzip = gzipSync(raw, { level: 9 });
      const name = chunkName(date, storeId, index++);
      descriptors.push(describeChunk(part, raw, gzip, name)); chunks.set(name, gzip); part = [];
    };
    for (const row of groups.get(key)) {
      const candidate = [...part, row];
      const raw = encode(candidate);
      if (candidate.length > limits.maxRowsPerChunk || raw.length > limits.maxRawBytes
        || gzipSync(raw, { level: 9 }).length > limits.maxCompressedBytes) {
        requireValue(part.length > 0, 'single row exceeds chunk limit');
        flush();
      }
      const single = encode([row]);
      requireValue(single.length <= limits.maxRawBytes && gzipSync(single, { level: 9 }).length <= limits.maxCompressedBytes,
        'single row exceeds chunk limit');
      part.push(row);
    }
    if (part.length) flush();
  }
  return { manifest: {
    version: 1, schema: SCHEMA, projectId, cutoff, snapshotAt, source: { ...SOURCE }, limits,
    rowCount: rows.length, rowsSha256: digest(encode(rows)), chunks: descriptors,
  }, chunks };
}

function validateManifest(manifest, expected) {
  exactKeys(manifest, ['version', 'schema', 'projectId', 'cutoff', 'snapshotAt', 'source', 'limits', 'rowCount', 'rowsSha256', 'chunks'], 'manifest');
  requireValue(manifest.version === 1 && manifest.schema === SCHEMA, 'unsupported schema/version');
  text(manifest.projectId, 'projectId'); timestamp(manifest.cutoff); timestamp(manifest.snapshotAt);
  requireValue(manifest.cutoff <= manifest.snapshotAt && same(manifest.source, SOURCE), 'source/cutoff metadata');
  exactKeys(expected, Object.keys(expected).filter(key => ['projectId', 'cutoff', 'snapshotAt'].includes(key)), 'expected');
  for (const [key, value] of Object.entries(expected)) requireValue(value === manifest[key], `${key} mismatch`);
  limitsFor(manifest.limits);
  requireValue(Number.isSafeInteger(manifest.rowCount) && manifest.rowCount >= 0 && manifest.rowCount <= MAX_ROWS, 'rowCount');
  requireValue(typeof manifest.rowsSha256 === 'string' && /^[a-f0-9]{64}$/.test(manifest.rowsSha256), 'rows hash');
  requireValue(Array.isArray(manifest.chunks) && manifest.chunks.length <= MAX_ROWS, 'chunks list');
  const names = new Set();
  const counters = new Map();
  let total = 0;
  for (const chunk of manifest.chunks) {
    exactKeys(chunk, ['name', 'storeId', 'date', 'rowCount', 'rawBytes', 'gzipBytes', 'rawSha256', 'gzipSha256',
      'firstRecordedAt', 'lastRecordedAt', 'firstId', 'lastId', 'productIds'], 'chunk');
    text(chunk.storeId, 'storeId'); timestamp(`${chunk.date}T00:00:00.000000Z`);
    const key = JSON.stringify([chunk.date, chunk.storeId]);
    const index = counters.get(key) ?? 0; counters.set(key, index + 1);
    requireValue(chunk.name === chunkName(chunk.date, chunk.storeId, index) && !names.has(chunk.name), 'unsafe/duplicate chunk name');
    names.add(chunk.name);
    for (const [field, limit] of [['rowCount', 'maxRowsPerChunk'], ['rawBytes', 'maxRawBytes'], ['gzipBytes', 'maxCompressedBytes']]) {
      requireValue(Number.isSafeInteger(chunk[field]) && chunk[field] > 0 && chunk[field] <= manifest.limits[limit], `chunk ${field}`);
    }
    requireValue([chunk.rawSha256, chunk.gzipSha256].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)), 'chunk hashes');
    timestamp(chunk.firstRecordedAt); timestamp(chunk.lastRecordedAt);
    requireValue(chunk.firstRecordedAt <= chunk.lastRecordedAt && chunk.lastRecordedAt < manifest.cutoff
      && chunk.firstRecordedAt.startsWith(chunk.date) && chunk.lastRecordedAt.startsWith(chunk.date), 'chunk date range');
    requireValue(Array.isArray(chunk.productIds) && chunk.productIds.length > 0 && chunk.productIds.length <= chunk.rowCount,
      'chunk productIds');
    chunk.productIds.forEach(id => text(id, 'productId'));
    requireValue(same(chunk.productIds, [...new Set(chunk.productIds)].sort(compare)), 'productIds order');
    total += chunk.rowCount;
  }
  requireValue(total === manifest.rowCount, 'manifest count mismatch');
}

async function readChunk(chunk, manifest, fetchChunk) {
  // El nombre se deriva y valida antes de entregarlo al adaptador de IO.
  const gzip = await fetchChunk(chunk.name);
  requireValue(Buffer.isBuffer(gzip) && gzip.length === chunk.gzipBytes && digest(gzip) === chunk.gzipSha256, 'missing/corrupt gzip chunk');
  const raw = gunzipSync(gzip, { maxOutputLength: manifest.limits.maxRawBytes });
  requireValue(raw.length === chunk.rawBytes && digest(raw) === chunk.rawSha256, 'raw integrity mismatch');
  const lines = raw.toString('utf8').split('\n');
  requireValue(lines.pop() === '' && lines.length === chunk.rowCount, 'NDJSON count/framing');
  const rows = lines.map(line => canonicalRow(JSON.parse(line)));
  requireValue(encode(rows).equals(raw) && same(rows, [...rows].sort(orderRows)), 'noncanonical row/order');
  requireValue(rows.every(row => row.store_id === chunk.storeId && row.recorded_at.startsWith(chunk.date)), 'mixed store/date');
  requireValue(same(describeChunk(rows, raw, gzip, chunk.name), chunk), 'chunk metadata mismatch');
  return rows;
}

async function readChunks(manifest, fetchChunk, descriptors) {
  requireValue(typeof fetchChunk === 'function', 'fetchChunk function');
  const rows = [];
  for (const chunk of descriptors) rows.push(...await readChunk(chunk, manifest, fetchChunk));
  rows.sort(orderRows);
  requireValue(new Set(rows.map(row => row.id)).size === rows.length, 'duplicate id');
  return rows;
}

export async function verifyHistoryArchive(manifest, fetchChunk, expected = {}) {
  manifest = structuredClone(manifest);
  validateManifest(manifest, expected);
  const rows = await readChunks(manifest, fetchChunk, manifest.chunks);
  requireValue(rows.length === manifest.rowCount && digest(encode(rows)) === manifest.rowsSha256, 'archive rows integrity');
  return rows;
}

// Una selección valida sus chunks completos, pero no acredita la integridad global.
export async function readHistoryArchiveSelection(manifest, fetchChunk, selection, expected = {}) {
  manifest = structuredClone(manifest);
  selection = structuredClone(selection);
  validateManifest(manifest, expected);
  exactKeys(selection, Object.keys(selection).filter(key => ['storeId', 'date', 'productId'].includes(key)), 'selection');
  for (const [key, value] of Object.entries(selection)) {
    if (key === 'date') timestamp(`${value}T00:00:00.000000Z`);
    else text(value, key);
  }
  const chunks = manifest.chunks.filter(chunk => (!selection.storeId || chunk.storeId === selection.storeId)
    && (!selection.date || chunk.date === selection.date) && (!selection.productId || chunk.productIds.includes(selection.productId)));
  const rows = (await readChunks(manifest, fetchChunk, chunks)).filter(row => !selection.productId || row.product_id === selection.productId);
  return { rows, verification: 'selected-chunks', verifiedChunks: chunks.length, totalChunks: manifest.chunks.length };
}
