import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStoreLanes, STORE_LANE_SKIPPED } from './store-lanes';

type Span = { store: string; start: number; end: number };

function recordingTask(spans: Span[], store: string, durationMs: number) {
  return async () => {
    const span = { store, start: Date.now(), end: 0 };
    spans.push(span);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    span.end = Date.now();
    return store;
  };
}

describe('createStoreLanes', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T00:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('separa al menos 2000 ms las solicitudes de la misma tienda y nunca las superpone', async () => {
    const lanes = createStoreLanes({ concurrency: 8, spacingMs: 2000 });
    const spans: Span[] = [];
    const all = Promise.all([300, 50, 1200, 10].map(ms => lanes.run('mexx', recordingTask(spans, 'mexx', ms))));
    await vi.runAllTimersAsync();
    await all;
    expect(spans).toHaveLength(4);
    for (let index = 1; index < spans.length; index++) {
      expect(spans[index].start - spans[index - 1].end).toBeGreaterThanOrEqual(2000);
    }
  });

  it('superpone tiendas distintas sin que el espaciado ocupe el cupo global', async () => {
    const lanes = createStoreLanes({ concurrency: 2, spacingMs: 2000 });
    const spans: Span[] = [];
    const all = Promise.all([
      lanes.run('mexx', recordingTask(spans, 'mexx', 500)),
      lanes.run('mexx', recordingTask(spans, 'mexx', 500)),
      lanes.run('venex', recordingTask(spans, 'venex', 500)),
      lanes.run('fullh4rd', recordingTask(spans, 'fullh4rd', 500)),
    ]);
    await vi.runAllTimersAsync();
    await all;
    const start = (store: string, nth = 0) => spans.filter(span => span.store === store)[nth].start;
    const origin = start('mexx');
    expect(start('venex') - origin).toBe(0);
    // El segundo mexx espera su turno sin retener el cupo: fullh4rd entra cuando termina el primero.
    expect(start('fullh4rd') - origin).toBe(500);
    expect(start('mexx', 1) - origin).toBe(2500);
  });

  it('respeta el máximo global de solicitudes en curso', async () => {
    const lanes = createStoreLanes({ concurrency: 3, spacingMs: 2000 });
    let running = 0, peak = 0;
    const all = Promise.all(Array.from({ length: 10 }, (_, index) => lanes.run(`store-${index}`, async () => {
      running++; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 100));
      running--;
    })));
    await vi.runAllTimersAsync();
    await all;
    expect(peak).toBe(3);
    expect(lanes.activeCount()).toBe(0);
  });

  it('omite sin esperar espaciado ni marcar la tienda cuando corresponde saltear', async () => {
    const lanes = createStoreLanes({ concurrency: 1, spacingMs: 2000 });
    const spans: Span[] = [];
    const first = lanes.run('mexx', recordingTask(spans, 'mexx', 10));
    await vi.advanceTimersByTimeAsync(10);
    await first;
    const skippedAt = Date.now();
    const skipped = await lanes.run('mexx', recordingTask(spans, 'mexx', 10), () => true);
    expect(skipped).toBe(STORE_LANE_SKIPPED);
    expect(Date.now()).toBe(skippedAt);
    expect(spans).toHaveLength(1);
  });

  it('vuelve a evaluar el salteo después de esperar el turno', async () => {
    const lanes = createStoreLanes({ concurrency: 4, spacingMs: 2000 });
    let stop = false;
    const first = lanes.run('mexx', async () => { stop = true; return 'first'; });
    const second = lanes.run('mexx', async () => 'second', () => stop);
    await vi.runAllTimersAsync();
    expect(await first).toBe('first');
    expect(await second).toBe(STORE_LANE_SKIPPED);
  });

  it('no espacia las tiendas exentas de lectura compartida', async () => {
    const lanes = createStoreLanes({ concurrency: 4, spacingMs: 2000, isExempt: store => store === 'compragamer' });
    const spans: Span[] = [];
    const all = Promise.all([lanes.run('compragamer', recordingTask(spans, 'compragamer', 100)), lanes.run('compragamer', recordingTask(spans, 'compragamer', 100))]);
    await vi.runAllTimersAsync();
    await all;
    expect(spans[1].start - spans[0].end).toBe(0);
  });

  it('libera el carril y el cupo aunque la tarea falle', async () => {
    const lanes = createStoreLanes({ concurrency: 1, spacingMs: 2000 });
    const failing = lanes.run('mexx', async () => { throw new Error('boom'); });
    await expect(failing).rejects.toThrow('boom');
    const next = lanes.run('venex', async () => 'ok');
    await vi.runAllTimersAsync();
    expect(await next).toBe('ok');
    expect(lanes.activeCount()).toBe(0);
  });
});
