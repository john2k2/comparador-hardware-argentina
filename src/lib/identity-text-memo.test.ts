import { describe, expect, it, vi } from 'vitest';
import { createBoundedIdentityTextMemo, IDENTITY_TEXT_MEMO_ENTRIES, IDENTITY_TEXT_MEMO_LENGTH } from './identity-text-memo';

describe('memo de texto puro acotado', () => {
  it('usa string original, conserva valores null y expulsa el menos recientemente usado', () => {
    const compute = vi.fn((text: string) => text === 'none' ? null : text);
    const memo = createBoundedIdentityTextMemo(compute, value => value, 3);
    for (const text of ['A', 'B', 'C', 'A', 'D']) expect(memo(text)).toBe(text);
    expect(compute).toHaveBeenCalledTimes(4);
    expect(memo('A')).toBe('A'); expect(compute).toHaveBeenCalledTimes(4);
    expect(memo('B')).toBe('B'); expect(compute).toHaveBeenCalledTimes(5);
    expect(memo('none')).toBeNull(); expect(memo('none')).toBeNull(); expect(compute).toHaveBeenCalledTimes(6);
    expect(memo('a')).toBe('a'); expect(compute).toHaveBeenCalledTimes(7);
  });
  it('mantiene copia privada profundamente congelada y entrega objetos/arrays mutables independientes', () => {
    const compute = vi.fn((text: string) => ({ nested: { suffixes: [text] } }));
    const copy = vi.fn((value: ReturnType<typeof compute>) => ({ nested: { suffixes: [...value.nested.suffixes] } }));
    const memo = createBoundedIdentityTextMemo(compute, copy);
    const first = memo('Ti Super'); first.nested.suffixes.push('modified');
    const second = memo('Ti Super'); expect(second).toEqual({ nested: { suffixes: ['Ti Super'] } });
    expect(Object.isFrozen(copy.mock.calls.at(-1)![0])).toBe(true);
    expect(Object.isFrozen(copy.mock.calls.at(-1)![0].nested.suffixes)).toBe(true);
    expect(Object.isFrozen(second.nested.suffixes)).toBe(false);
    second.nested.suffixes[0] = 'other'; expect(memo('Ti Super').nested.suffixes).toEqual(['Ti Super']);
    expect(compute).toHaveBeenCalledTimes(1);
  });
  it('no memoriza texto mayor al límite y rechaza ampliar el cupo', () => {
    const compute = vi.fn((text: string) => text), memo = createBoundedIdentityTextMemo(compute, value => value);
    const boundary = 'x'.repeat(IDENTITY_TEXT_MEMO_LENGTH), huge = boundary + 'y';
    memo(boundary); memo(boundary); expect(compute).toHaveBeenCalledTimes(1);
    memo(huge); memo(huge); expect(compute).toHaveBeenCalledTimes(3);
    for (const limit of [0, -1, NaN, Infinity, 1.5, IDENTITY_TEXT_MEMO_ENTRIES + 1])
      expect(() => createBoundedIdentityTextMemo(compute, value => value, limit)).toThrow('IDENTITY_TEXT_MEMO_LIMIT_INVALID');
  });
});
