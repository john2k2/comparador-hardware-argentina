import { describe, expect, it } from 'vitest';
import { buildAdSenseCspPolicy } from './csp-policy';

describe('candidato CSP publicitario sin activación pública', () => {
  it('autoriza scripts mediante el nonce sin modificar la protección contra marcos externos', () => {
    const nonce = '0123456789abcdef0123456789abcdef';
    const policy = buildAdSenseCspPolicy(nonce);
    expect(policy).toContain(`script-src 'nonce-${nonce}'`);
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("base-uri 'none'");
  });

  it.each(['', 'abc', "'; script-src *", '0123456789abcdef0123456789abcdef\n', 'g'.repeat(32)])('rechaza nonce no válido: %s', (nonce) => {
    expect(() => buildAdSenseCspPolicy(nonce)).toThrow('ADSENSE_INVALID_NONCE');
  });
});
