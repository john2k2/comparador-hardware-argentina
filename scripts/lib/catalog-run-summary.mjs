import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const inventoryStores = ['compragamer', 'maxtecno', 'dinobyte', 'goldentechstore', 'katech'];
const sourceReasons = ['blocked', 'rate-limited', 'not-found', 'http-error', 'invalid-response', 'too-large', 'inconsistent-source'];
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? String(value) : 'no informado';
const code = value => sourceReasons.includes(value) ? value : typeof value === 'string' && /^REFRESH_[A-Z_]{1,70}$/.test(value) ? value : 'sin diagnóstico permitido';

// Sólo campos operativos admitidos. Nunca copiar payloads, URLs ni mensajes del SDK al resumen.
export function formatCatalogRunSummary(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('REFRESH_SUMMARY_INVALID');
  const status = ['completed', 'deadline', 'failed', 'partial', 'deferred'].includes(receipt.status) ? receipt.status : 'no informado';
  const lines = ['### Catálogo: ' + status, '',
    `Intentadas: ${count(receipt.attempted)}. Observadas: ${count(receipt.observed)}. Comparables: ${count(receipt.comparable)}.`,
    '', 'Una observación guardada no acredita cobertura completa ni disponibilidad futura.'];
  if (receipt.failureCode || receipt.error) lines.push('', 'Fallo del runner: ' + code(receipt.failureCode ?? receipt.error) + '.');
  for (const item of Array.isArray(receipt.inventory) ? receipt.inventory.slice(0, 5) : []) {
    if (item?.status !== 'failed') continue;
    lines.push('', 'Inventario fallido: ' + (inventoryStores.includes(item.storeId) ? item.storeId : 'otra fuente') + ' — ' + code(item.code) + '.');
  }
  if (receipt.inventoryDetails?.status === 'failed') lines.push('', 'Descubrimiento de fichas: failed.');
  const global = receipt.persistenceDiagnostic?.global;
  if (global) lines.push('', `ACK de observaciones: ${count(global.confirmed)} confirmados; ${count(global.ackUnconfirmed)} sin confirmar; ${count(global.invalidResponse)} inválidos.`);
  if (status === 'failed') lines.push('', 'La ejecución conserva exit 1. Las observaciones parciales no reparan la fuente fallida.');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [receiptPath] = process.argv.slice(2);
    if (!receiptPath) throw new Error('REFRESH_SUMMARY_INVALID');
    const raw = await readFile(receiptPath, 'utf8');
    if (raw.length > 1_000_000) throw new Error('REFRESH_SUMMARY_INVALID');
    const summary = formatCatalogRunSummary(JSON.parse(raw));
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch { process.stderr.write('REFRESH_SUMMARY_UNAVAILABLE\n'); process.exitCode = 1; }
}
