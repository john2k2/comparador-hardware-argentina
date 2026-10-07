const SCOPES = ['operational-store-event', 'operational-endpoint-event'];
const FIELDS = ['cache_key', 'scope', 'expires_at', 'updated_at'];
const MAX_ROWS = 250;

function requireValue(condition, message) {
  if (!condition) throw new Error(`Telemetry retention: ${message}`);
}

function exactFields(value, fields, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)), `${label} fields`);
}

// Compara UTC sin Date ni redondeo. Los valores originales quedan intactos para el DELETE.
function utcTime(value) {
  const match = typeof value === 'string'
    && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
  requireValue(match, 'invalid UTC timestamp');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ''] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireValue(year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour < 24 && minute < 60 && second < 60, 'invalid calendar timestamp');
  return `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}.${fraction.padEnd(6, '0')}Z`;
}

function validateOptions(options) {
  requireValue(options && typeof options === 'object' && !Array.isArray(options), 'options object');
  requireValue(Object.keys(options).every(key => ['mode', 'cutoff', 'now', 'limit', 'approvalId'].includes(key)), 'unknown option');
  requireValue(Object.hasOwn(options, 'cutoff') && Object.hasOwn(options, 'now'), 'explicit cutoff and now required');
  const { mode = 'dry-run', cutoff, now, limit = MAX_ROWS, approvalId } = options;
  requireValue(mode === 'dry-run' || mode === 'apply', 'unknown mode');
  const cutoffTime = utcTime(cutoff);
  requireValue(cutoffTime <= utcTime(now), 'cutoff after now');
  requireValue(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_ROWS, 'limit must be 1..250');
  if (mode === 'apply') {
    requireValue(Object.hasOwn(options, 'approvalId') && typeof approvalId === 'string' && approvalId.trim().length > 0,
      'explicit approvalId required for apply');
  }
  return { mode, cutoff, cutoffTime, limit };
}

function validateRows(data, cutoffTime, limit) {
  requireValue(Array.isArray(data) && data.length <= limit, 'invalid candidate count');
  const keys = new Set();
  return data.map(row => {
    exactFields(row, FIELDS, 'candidate metadata');
    requireValue(typeof row.cache_key === 'string' && row.cache_key.length > 0 && !row.cache_key.includes('\0'), 'invalid candidate key');
    requireValue(SCOPES.includes(row.scope), 'non-telemetry candidate scope');
    requireValue(utcTime(row.expires_at) < cutoffTime && utcTime(row.updated_at) <= cutoffTime, 'candidate not expired before cutoff or renewed');
    requireValue(!keys.has(row.cache_key), 'duplicate candidate key');
    keys.add(row.cache_key);
    // Una copia evita que un callback cambie los predicados después de validar el lote.
    return Object.fromEntries(FIELDS.map(field => [field, row[field]]));
  });
}

/**
 * Plan acotado de eventos vencidos; no lee payloads ni crea clientes.
 * success describe este lote. unknown cuenta candidatos intentados sin ACK concluyente,
 * no filas borradas. Al detenerse, selected puede incluir candidatos no intentados.
 * El caller conserva la autorización: approvalId es explícito, no una credencial.
 */
export async function processTelemetryRetentionPlan(client, options) {
  const { mode, cutoff, cutoffTime, limit } = validateOptions(options);
  requireValue(client && typeof client.from === 'function', 'client required');
  const result = { mode, cutoff, selected: 0, removed: 0, changedSkipped: 0, unknown: 0, stopped: false, success: false, rows: [] };
  let response;
  try {
    response = await client.from('api_cache_entries').select(FIELDS.join(','))
      .in('scope', [...SCOPES]).lt('expires_at', cutoff).lte('updated_at', cutoff)
      .order('expires_at', { ascending: true }).order('cache_key', { ascending: true }).limit(limit);
  } catch {
    return { ...result, stopped: true };
  }
  if (!response || response.error) return { ...result, stopped: true };
  // Validar el lote completo antes de habilitar siquiera el primer DELETE.
  const rows = validateRows(response.data, cutoffTime, limit);
  result.selected = rows.length;
  result.rows = rows.map(row => ({ ...row }));
  if (mode === 'dry-run') return { ...result, success: true };

  for (const row of rows) {
    let acknowledgement;
    try {
      acknowledgement = await client.from('api_cache_entries').delete()
        .eq('cache_key', row.cache_key).eq('scope', row.scope)
        .eq('expires_at', row.expires_at).eq('updated_at', row.updated_at)
        .lt('expires_at', cutoff).select('cache_key');
    } catch {
      result.unknown++;
      result.stopped = true;
      return result;
    }
    if (!acknowledgement || acknowledgement.error || !Array.isArray(acknowledgement.data)) {
      result.unknown++;
      result.stopped = true;
      return result;
    }
    if (acknowledgement.data.length === 0) {
      result.changedSkipped++;
    } else if (acknowledgement.data.length === 1
      && Object.keys(acknowledgement.data[0] ?? {}).length === 1
      && Object.hasOwn(acknowledgement.data[0], 'cache_key')
      && acknowledgement.data[0]?.cache_key === row.cache_key) {
      result.removed++;
    } else {
      result.unknown++;
      result.stopped = true;
      return result;
    }
  }
  result.success = true;
  return result;
}
