import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { encodeTelemetrySelection, decodeTelemetrySelection, TELEMETRY_SELECTION_LIMIT } from './telemetry-selection-codec.mjs';

test('codec preserva bytes JSON, Unicode, escapes y microsegundos; gzip9 determinístico', () => {
  const bytes = Buffer.from('{"projectId":"fixture-project","rows":[{"cache_key":"fixture:ñ\\\\key","updated_at":"2026-10-01T00:00:00.123456Z"}]}\n');
  const gzipBytes = encodeTelemetrySelection(bytes);
  assert.ok(decodeTelemetrySelection(gzipBytes).equals(bytes));
  assert.ok(encodeTelemetrySelection(bytes).equals(gzipBytes));
  assert.ok(gzipBytes.equals(gzipSync(bytes, { level: 9 })));
});

test('codec rechaza gzip corrupto, truncado y expansión mayor a1MiB sin contenido de error', () => {
  const gzipBytes = encodeTelemetrySelection(Buffer.from('fixture-private-value'));
  const corrupted = Buffer.from(gzipBytes); corrupted[corrupted.length - 8] ^= 1;
  for (const bytes of [corrupted, gzipBytes.subarray(0, -1), gzipSync(Buffer.alloc(TELEMETRY_SELECTION_LIMIT + 1, 97))]) {
    assert.throws(() => decodeTelemetrySelection(bytes), { message: 'TELEMETRY_MAINTENANCE_SELECTION_GZIP' });
  }
});

test('codec limita entrada y salida a1MiB y admite frontera exacta', () => {
  const maximum = Buffer.alloc(TELEMETRY_SELECTION_LIMIT, 97);
  assert.ok(decodeTelemetrySelection(encodeTelemetrySelection(maximum)).equals(maximum));
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(TELEMETRY_SELECTION_LIMIT + 1), 'fixture']) {
    assert.throws(() => encodeTelemetrySelection(bytes), /SELECTION_BYTES/);
    assert.throws(() => decodeTelemetrySelection(bytes), /SELECTION_BYTES/);
  }
});
