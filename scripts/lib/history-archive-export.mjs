// Exportación de sólo lectura: CSV evita convertir NUMERIC a números de JavaScript.
export const HISTORY_COLUMNS = ['id', 'product_id', 'store_id', 'price', 'original_price', 'stock', 'recorded_at', 'offer_url'];
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function parseHistoryCsv(csv) {
  if (typeof csv !== 'string' || Buffer.byteLength(csv) > 8 * 1024 * 1024) throw new Error('HISTORY_CSV_SIZE');
  const records = [];
  let record = [], cell = '', quoted = false, inside = false, closed = false;
  const finishCell = () => {
    record.push(cell === '' && !quoted ? null : cell);
    cell = ''; quoted = false; closed = false;
  };
  const finishRecord = () => { finishCell(); records.push(record); record = []; };
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (inside) {
      if (char !== '"') cell += char;
      else if (csv[i + 1] === '"') { cell += '"'; i++; }
      else { inside = false; closed = true; }
    } else if (char === '"') {
      if (cell !== '' || quoted || closed) throw new Error('HISTORY_CSV_QUOTE');
      quoted = true; inside = true;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[i + 1] === '\n') i++;
      finishRecord();
    } else {
      if (closed) throw new Error('HISTORY_CSV_TRAILING_CELL');
      cell += char;
    }
  }
  if (inside) throw new Error('HISTORY_CSV_TRUNCATED');
  if (record.length || cell !== '' || quoted) finishRecord();
  const header = records.shift();
  if (JSON.stringify(header) !== JSON.stringify(HISTORY_COLUMNS)) throw new Error('HISTORY_CSV_SCHEMA');
  return records.map(values => {
    if (values.length !== HISTORY_COLUMNS.length) throw new Error('HISTORY_CSV_COLUMNS');
    const row = Object.fromEntries(HISTORY_COLUMNS.map((column, i) => [column, values[i]]));
    row.recorded_at = canonicalUtcTimestamp(row.recorded_at);
    return row;
  });
}

export function canonicalUtcTimestamp(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/);
  if (!match) throw new Error('HISTORY_TIMESTAMP_UTC');
  const prefix = `${match[1]}T${match[2]}`;
  const millis = new Date(`${prefix}Z`);
  if (!Number.isFinite(millis.getTime()) || millis.toISOString().slice(0, 19) !== prefix) throw new Error('HISTORY_TIMESTAMP_DATE');
  return `${prefix}.${(match[3] || '').padEnd(6, '0')}Z`;
}

export async function exportHistorySample(readPage, { cutoff, limit = 1000, pageSize = 250, afterId = '' }) {
  cutoff = canonicalUtcTimestamp(cutoff);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) throw new Error('HISTORY_EXPORT_BUDGET');
  if (afterId && !UUID.test(afterId)) throw new Error('HISTORY_EXPORT_CURSOR');
  const rows = [];
  let cursor = afterId, pages = 0, rawBytes = 0, reachedSourceEnd = false;
  while (rows.length < limit) {
    const take = Math.min(pageSize, limit - rows.length);
    const csv = await readPage({ cutoff, afterId: cursor, limit: take });
    rawBytes += Buffer.byteLength(csv);
    if (rawBytes > 8 * 1024 * 1024) throw new Error('HISTORY_EXPORT_BYTES');
    const page = parseHistoryCsv(csv);
    pages++;
    if (page.length > take) throw new Error('HISTORY_EXPORT_OVER_BUDGET');
    for (const row of page) {
      if (!UUID.test(row.id || '') || (cursor && row.id <= cursor)) throw new Error('HISTORY_EXPORT_UNSTABLE_CURSOR');
      if (row.recorded_at >= cutoff) throw new Error('HISTORY_EXPORT_CUTOFF');
      rows.push(row); cursor = row.id;
    }
    if (page.length < take) { reachedSourceEnd = true; break; }
  }
  return { rows, receipt: { cutoff, initialCursor: afterId, nextCursor: cursor, pages, exportedRows: rows.length, sourceCsvBytes: rawBytes, reachedSourceEnd, globallyComplete: false, transactionalSnapshot: false } };
}
