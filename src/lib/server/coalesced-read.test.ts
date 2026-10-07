import { describe, expect, it, vi } from 'vitest';
import { createCoalescedRead } from './coalesced-read';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('coalesced read', () => {
  it('diez callers comparten una lectura y la siguiente llamada vuelve a leer', async () => {
    const run = createCoalescedRead<number>();
    const first = deferred<number>();
    const read = vi.fn(() => first.promise);
    const callers = Array.from({ length: 10 }, () => run('same', read));
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    first.resolve(7);
    expect(await Promise.all(callers)).toEqual(Array(10).fill(7));
    expect(await run('same', read)).toBe(7);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('propaga rechazo a todos, limpia y permite otra lectura sin retry automático', async () => {
    const run = createCoalescedRead<number>();
    const first = deferred<number>();
    const read = vi.fn(() => first.promise);
    const callers = Array.from({ length: 10 }, () => run('same', read));
    const observed = Promise.allSettled(callers);
    first.reject(new Error('fixture'));
    expect((await observed).every((result) => result.status === 'rejected')).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    read.mockResolvedValueOnce(8);
    expect(await run('same', read)).toBe(8);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('saturación no expulsa ni limpia otra lectura; las claves nuevas leen por separado', async () => {
    const run = createCoalescedRead<number>(1);
    const first = deferred<number>();
    const readFirst = vi.fn(() => first.promise);
    const active = run('active', readFirst);
    const overflowRead = vi.fn(async () => 2);
    expect(await run('overflow', overflowRead)).toBe(2);
    expect(await run('overflow', overflowRead)).toBe(2);
    expect(overflowRead).toHaveBeenCalledTimes(2);
    const follower = run('active', readFirst);
    expect(follower).toBe(active);
    expect(readFirst).toHaveBeenCalledTimes(1);
    first.resolve(1);
    await Promise.all([active, follower]);
    const admitted = deferred<number>();
    const nextRead = vi.fn(() => admitted.promise);
    const next = run('next', nextRead);
    expect(run('next', nextRead)).toBe(next);
    admitted.resolve(3);
    expect(await next).toBe(3);
    expect(nextRead).toHaveBeenCalledTimes(1);
  });

  it('un productor que lanza sincrónicamente también limpia el vuelo', async () => {
    const run = createCoalescedRead<number>();
    await expect(run('key', () => { throw new Error('fixture'); })).rejects.toThrow('fixture');
    expect(await run('key', async () => 5)).toBe(5);
  });
});
