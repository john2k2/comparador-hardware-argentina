import { isAdvertisingNonce } from './editorial-pilot';

/** Candidato compatible con la guía de Google. No reemplaza automáticamente la CSP pública. */
export function buildAdSenseCspPolicy(nonce: string): string {
  if (!isAdvertisingNonce(nonce)) throw new Error('ADSENSE_INVALID_NONCE');
  return [
    "object-src 'none'",
    `script-src 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' https: http:`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
