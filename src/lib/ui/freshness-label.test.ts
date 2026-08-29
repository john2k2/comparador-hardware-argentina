import { describe, expect, it } from 'vitest';
import { freshnessLabel } from './freshness-label';

const now = Date.UTC(2026, 7, 29, 18, 0, 0);

describe('freshnessLabel', () => {
  it('no usa Date.now() implícito cuando se pasa un reloj', () => {
    expect(freshnessLabel(now - 30 * 60 * 1000, now)).toBe('ACTUALIZADO HACE MENOS DE 1 HORA');
    expect(freshnessLabel(now - 3 * 60 * 60 * 1000, now)).toBe('ACTUALIZADO HACE 3 H');
    expect(freshnessLabel(now - 48 * 60 * 60 * 1000, now)).toBe('ACTUALIZADO HACE 2 D');
  });
});
