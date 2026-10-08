// El hash de custodia siempre corresponde al JSON original, nunca al contenedor gzip.
import { gzipSync, gunzipSync } from 'node:zlib';

export const TELEMETRY_SELECTION_LIMIT = 1024 ** 2;
const requireBytes = bytes => {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > TELEMETRY_SELECTION_LIMIT) {
    throw new Error('TELEMETRY_MAINTENANCE_SELECTION_BYTES');
  }
};

export function encodeTelemetrySelection(bytes) {
  requireBytes(bytes);
  const gzipBytes = gzipSync(bytes, { level: 9 });
  requireBytes(gzipBytes);
  return gzipBytes;
}

export function decodeTelemetrySelection(gzipBytes) {
  requireBytes(gzipBytes);
  let bytes;
  try { bytes = gunzipSync(gzipBytes, { maxOutputLength: TELEMETRY_SELECTION_LIMIT }); }
  catch { throw new Error('TELEMETRY_MAINTENANCE_SELECTION_GZIP'); }
  requireBytes(bytes);
  return bytes;
}
