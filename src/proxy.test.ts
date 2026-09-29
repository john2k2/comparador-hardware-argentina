import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('nonce de hidratación', () => {
  it('entrega la misma política a Next.js y al navegador, reemplazando cabeceras externas', () => {
    const request = new NextRequest('https://example.com/auth', {
      headers: { 'Content-Security-Policy': "script-src 'nonce-untrusted'", 'x-content-security-policy-nonce': 'untrusted' },
    });
    const response = proxy(request);
    const nonce = response.headers.get('x-middleware-request-x-content-security-policy-nonce');
    const policy = response.headers.get('Content-Security-Policy');
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe('untrusted');
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
    expect(proxy(request).headers.get('x-content-security-policy-nonce')).not.toBe(nonce);
  });
});
