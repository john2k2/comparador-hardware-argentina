import { describe, expect, it } from 'vitest';
import { getComparisonBySlug } from './comparisons-data';

describe('rtx-4060-vs-rx-7600 specs', () => {
  it('no trata el bus 128-bit como ventaja de una y desventaja de la otra', () => {
    const comparison = getComparisonBySlug('rtx-4060-vs-rx-7600');
    expect(comparison).toBeDefined();

    const mentions128 = (value: string) => /128/i.test(value);
    expect(comparison?.product1.cons.some(mentions128)).toBe(false);
    expect(comparison?.product2.pros.some(mentions128)).toBe(false);
    expect(comparison?.product1.specs).toMatch(/128-bit/i);
    expect(comparison?.product2.specs).toMatch(/128-bit/i);
  });
});
