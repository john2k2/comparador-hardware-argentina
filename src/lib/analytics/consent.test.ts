import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_CONSENT_MAX_AGE_MS, buildAnalyticsBootstrap, parseAnalyticsChoice } from './consent';

function executeBootstrap(raw: string | null, blockedStorage = false) {
  const appended: { src: string; nonce: string }[] = [];
  const window: Record<string, unknown> = { localStorage: { getItem: () => { if (blockedStorage) throw new Error('blocked'); return raw; } } };
  const document = { currentScript: { nonce: 'nonce-test' }, createElement: () => ({}), head: { appendChild: (node: { src: string; nonce: string }) => appended.push(node) } };
  runInNewContext(buildAnalyticsBootstrap('G-TEST123'), { window, document, Date });
  return { window, appended, apply: window.__chaApplyAnalyticsChoice as (allowed: boolean) => void };
}

describe('Consentimiento básico de analítica', () => {
  it.each([null, 'broken', JSON.stringify({ allowed: false, savedAt: Date.now() }), JSON.stringify({ allowed: true, savedAt: Date.now() - ANALYTICS_CONSENT_MAX_AGE_MS - 1000 }), JSON.stringify({ allowed: true, savedAt: Date.now() + 60000 })])('no solicita Google sin una elección afirmativa vigente: %s', (raw) => {
    const result = executeBootstrap(raw);
    expect(result.appended).toHaveLength(0);
    expect(result.window.__chaAnalyticsAllowed).toBe(false);
  });

  it('bloquea Google si el almacenamiento no está disponible', () => {
    expect(executeBootstrap(null, true).appended).toHaveLength(0);
  });

  it('carga una sola etiqueta con nonce al aceptar y bloquea después de retirar', () => {
    const result = executeBootstrap(null);
    result.apply(true);
    result.apply(true);
    expect(result.appended).toEqual([{ async: true, nonce: 'nonce-test', src: 'https://www.googletagmanager.com/gtag/js?id=G-TEST123' }]);
    result.apply(false);
    expect(result.window.__chaAnalyticsAllowed).toBe(false);
    expect(result.window['ga-disable-G-TEST123']).toBe(true);
  });

  it('recupera una decisión afirmativa vigente y mantiene publicidad denegada', () => {
    const result = executeBootstrap(JSON.stringify({ allowed: true, savedAt: Date.now() }));
    expect(result.appended).toHaveLength(1);
    const commands = (result.window.dataLayer as IArguments[]).map((item) => Array.from(item));
    expect(commands[0]).toEqual(['consent', 'default', expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })]);
    expect(commands[1]).toEqual(['consent', 'update', expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'denied' })]);
  });

  it('valida expiración y no incorpora identificadores inválidos al script', () => {
    expect(parseAnalyticsChoice(JSON.stringify({ allowed: true, savedAt: 100 }), 101)).toEqual({ allowed: true, savedAt: 100 });
    expect(parseAnalyticsChoice(JSON.stringify({ allowed: true, savedAt: 100 }), 100 + ANALYTICS_CONSENT_MAX_AGE_MS)).toBeNull();
    expect(buildAnalyticsBootstrap('G-X</script>')).toBe('');
  });
});
