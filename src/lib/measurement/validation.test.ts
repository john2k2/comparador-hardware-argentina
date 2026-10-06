import { describe, expect, it } from 'vitest';
import { parseCommand, parseManualReading, readingPeriod } from './validation';

const now = new Date('2026-10-06T01:00:00Z');
const valid = { provider: 'catalog', collectedAt: '2026-10-05T22:00:00Z', period: { start: '2026-10-04', end: '2026-10-05', timeZone: 'UTC' }, metrics: { total: 100, observed24h: 19, observed3h: null } };

describe('lecturas de seguimiento', () => {
  it('distingue cero de desconocido y fija el origen manual', () => {
    expect(parseManualReading({ ...valid, metrics: { total: 100, observed24h: 0, observed3h: null } }, now)).toMatchObject({ origin: 'manual', metrics: { observed24h: 0, observed3h: null }, collectedAt: new Date(valid.collectedAt).toISOString() });
  });
  it.each([
    { ...valid, token: 'private' }, { ...valid, origin: 'api' }, { ...valid, metrics: { password: 'private' } },
    { ...valid, metrics: { observed24h: -1 } }, { ...valid, metrics: { total: 1, observed24h: 2 } },
    { ...valid, period: { ...valid.period, end: '2026-10-07' } },
    { ...valid, period: { ...valid.period, start: '2026-02-30' } },
    { ...valid, collectedAt: '2026-10-08T00:00:00Z' },
    { ...valid, provider: 'unknown' }, { ...valid, metrics: { observed24h: '19' } },
    { ...valid, period: { ...valid.period, url: 'https://example.com' } },
  ])('rechaza secretos, cifras o fechas fuera del contrato: %j', (value) => expect(() => parseManualReading(value, now)).toThrow());

  it('no permite inventar decisiones ni campos adicionales', () => {
    expect(parseCommand({ action: 'decision', id: 'catalog', status: 'done' })).toEqual({ action: 'decision', id: 'catalog', status: 'done' });
    expect(() => parseCommand({ action: 'decision', id: 'delete-project', status: 'done' })).toThrow();
    expect(() => parseCommand({ action: 'sync', provider: 'ga4', apiKey: 'private' })).toThrow();
  });
  it('calcula días completos en la zona de cada fuente, no por el reloj del navegador', () => {
    expect(readingPeriod('ga4', now)).toEqual({ start: '2026-09-28', end: '2026-10-04', timeZone: 'America/Buenos_Aires' });
    expect(readingPeriod('search-console', now)).toEqual({ start: '2026-09-05', end: '2026-10-02', timeZone: 'America/Los_Angeles' });
    expect(readingPeriod('cloudflare', now)).toEqual({ start: '2026-10-05', end: '2026-10-05', timeZone: 'UTC' });
  });
});
