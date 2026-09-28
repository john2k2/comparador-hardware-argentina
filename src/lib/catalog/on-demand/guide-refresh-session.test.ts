import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceGuideRefreshSession,
  confirmedGuideRefreshCount,
  createGuideRefreshSession,
} from './guide-refresh-session';
import type { RefreshItemResult, RefreshJob, RefreshTarget } from './contracts';

const NOW = '2026-09-28T12:00:00.000Z';
const FRESH = '2026-09-28T11:00:00.000Z';
const STALE = '2026-09-28T08:59:59.999Z';

function target(piece: number, variant = 'primary'): RefreshTarget {
  return {
    productId: `piece-${piece}`,
    storeId: `store-${piece}-${variant}`,
    url: `https://store.example/piece-${piece}/${variant}`,
  };
}

function result(item: RefreshTarget, overrides: Partial<RefreshItemResult> = {}): RefreshItemResult {
  return {
    ...item,
    state: 'updated',
    comparable: true,
    observedAt: FRESH,
    ...overrides,
  };
}

function job(id: string, targets: RefreshTarget[], overrides: Partial<RefreshJob> = {}): RefreshJob {
  return {
    id,
    status: 'running',
    targets,
    results: [],
    created_at: NOW,
    started_at: NOW,
    finished_at: null,
    expires_at: '2026-09-28T15:00:00.000Z',
    ...overrides,
  };
}

function callbacks(signal = new AbortController().signal) {
  return {
    signal,
    request: vi.fn(),
    poll: vi.fn(),
    wait: vi.fn().mockResolvedValue(undefined),
    onJob: vi.fn(),
    onObserved: vi.fn().mockResolvedValue(undefined),
  };
}

describe('guide refresh session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplica cada grupo y conserva como máximo tres candidatos', () => {
    const first = target(1);
    const second = target(1, 'fallback-1');
    const third = target(1, 'fallback-2');
    const fourth = target(1, 'fallback-3');
    const session = createGuideRefreshSession([[first, second, first, third, fourth]]);

    expect(session.groups).toEqual([[first, second, third]]);
  });

  it('rechaza una selección vacía, grupos vacíos o más de ocho grupos', () => {
    expect(() => createGuideRefreshSession([])).toThrow();
    expect(() => createGuideRefreshSession([[]])).toThrow();
    expect(() => createGuideRefreshSession(Array.from({ length: 9 }, () => [target(1)]))).toThrow();
  });

  it('refresca siete piezas en solicitudes seriales y hace fallback solo para las pendientes', async () => {
    const groups = Array.from({ length: 7 }, (_, piece) => [target(piece), target(piece, 'fallback')]);
    const session = createGuideRefreshSession(groups);
    const deps = callbacks();
    const requested: RefreshTarget[][] = [];
    const polled: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    deps.request.mockImplementation(async (targets: RefreshTarget[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      requested.push([...targets]);
      const id = `job-${requested.length}`;
      const firstRoundResults = targets.map((item, index) => index < 5
        ? result(item)
        : result(item, { state: index === 5 ? 'unavailable' : 'failed', comparable: false, observedAt: null }));
      const secondRoundResults = targets.map((item) => result(item));
      const results = requested.length === 1 ? firstRoundResults : secondRoundResults;
      inFlight--;
      return { job: job(id, targets, { status: 'running', results }) };
    });
    deps.poll.mockImplementation(async (id: string) => {
      polled.push(id);
      return job(id, requested[polled.length - 1], { status: 'completed', results: requested.length === 1
        ? requested[0].map((item, index) => index < 5
          ? result(item)
          : result(item, { state: index === 5 ? 'unavailable' : 'failed', comparable: false, observedAt: null }))
        : requested[1].map((item) => result(item)) });
    });

    expect(await advanceGuideRefreshSession(session, deps)).toBe('done');
    expect(maxInFlight).toBe(1);
    expect(requested).toHaveLength(2);
    expect(requested[0]).toEqual(groups.map(([primary]) => primary));
    expect(requested[1]).toEqual([groups[5][1], groups[6][1]]);
    expect(polled).toEqual(['job-1', 'job-2']);
    expect(confirmedGuideRefreshCount(session)).toBe(7);
  });

  it('detiene el avance después de tres rondas aunque aún queden candidatos', async () => {
    const candidates = [target(1), target(1, 'fallback-1'), target(1, 'fallback-2'), target(1, 'fallback-3')];
    const session = createGuideRefreshSession([candidates]);
    const deps = callbacks();
    const requested: RefreshTarget[][] = [];

    deps.request.mockImplementation(async (targets: RefreshTarget[]) => {
      requested.push([...targets]);
      return { job: job(`job-${requested.length}`, targets) };
    });
    deps.poll.mockImplementation(async (id: string) => job(id, requested[requested.length - 1], {
      status: 'completed',
      results: requested[requested.length - 1].map((item) => result(item, { state: 'unavailable', comparable: false, observedAt: null })),
    }));

    expect(await advanceGuideRefreshSession(session, deps)).toBe('done');
    expect(session.groups[0]).toHaveLength(3);
    expect(requested).toEqual(candidates.slice(0, 3).map((item) => [item]));
    expect(session.rounds).toBe(3);
  });

  it('conserva un sondeo pendiente y reanuda el mismo job antes de crear otro', async () => {
    const session = createGuideRefreshSession([[target(1)]]);
    const deps = callbacks();
    const requested = target(1);
    let pollCount = 0;
    const handle = job('job-pending', [requested]);

    deps.request.mockResolvedValue({ job: handle });
    deps.poll.mockImplementation(async (id: string) => {
      pollCount++;
      if (pollCount <= 60) return job(id, [requested]);
      return job(id, [requested], { status: 'completed', results: [result(requested)] });
    });

    expect(await advanceGuideRefreshSession(session, deps)).toBe('pending');
    expect(deps.poll).toHaveBeenCalledTimes(60);
    expect(deps.wait).toHaveBeenCalledTimes(60);
    expect(session.job?.id).toBe(handle.id);

    expect(await advanceGuideRefreshSession(session, deps)).toBe('done');
    expect(deps.request).toHaveBeenCalledTimes(1);
    expect(deps.poll).toHaveBeenLastCalledWith(handle.id);
  });

  it('conserva el job y devuelve deferred cuando el dispatch no está disponible', async () => {
    const session = createGuideRefreshSession([[target(1)]]);
    const deps = callbacks();
    const item = target(1);
    const handle = job('job-deferred', [item]);
    deps.request.mockResolvedValue({ job: handle, dispatch: 'unavailable' });

    expect(await advanceGuideRefreshSession(session, deps)).toBe('deferred');
    expect(session.job?.id).toBe(handle.id);
    expect(deps.poll).not.toHaveBeenCalled();

    deps.poll.mockResolvedValue(job(handle.id, [item], { status: 'completed', results: [result(item)] }));
    expect(await advanceGuideRefreshSession(session, deps)).toBe('done');
    expect(deps.request).toHaveBeenCalledTimes(1);
    expect(deps.poll).toHaveBeenCalledWith(handle.id);
  });

  it('conserva el handle original frente a errores transitorios de poll y no reinicia', async () => {
    const session = createGuideRefreshSession([[target(1)]]);
    const deps = callbacks();
    const item = target(1);
    const handle = job('job-error', [item]);
    deps.request.mockResolvedValue({ job: handle });
    deps.poll.mockRejectedValueOnce(new Error('poll temporal'));

    await expect(advanceGuideRefreshSession(session, deps)).rejects.toThrow('poll temporal');
    expect(session.job?.id).toBe(handle.id);

    deps.poll.mockResolvedValue(job(handle.id, [item], { status: 'completed', results: [result(item)] }));
    expect(await advanceGuideRefreshSession(session, deps)).toBe('done');
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it('impide una solicitud cuando la señal ya fue abortada', async () => {
    const controller = new AbortController();
    controller.abort();
    const session = createGuideRefreshSession([[target(1)]]);
    const deps = callbacks(controller.signal);

    await expect(advanceGuideRefreshSession(session, deps)).rejects.toThrow();
    expect(deps.request).not.toHaveBeenCalled();
    expect(deps.poll).not.toHaveBeenCalled();
  });

  it('persiste el job aceptado si aborta al volver de request y lo reanuda con una señal nueva', async () => {
    const controller = new AbortController();
    const item = target(1);
    const handle = job('job-request-aborted', [item]);
    const session = createGuideRefreshSession([[item]]);
    const deps = callbacks(controller.signal);
    deps.request.mockImplementation(async () => {
      controller.abort();
      return { job: handle };
    });

    await expect(advanceGuideRefreshSession(session, deps)).rejects.toThrow();
    expect(session.job?.id).toBe(handle.id);
    expect(session.rounds).toBe(1);
    expect(session.attempted).toEqual([item]);
    expect(deps.poll).not.toHaveBeenCalled();
    expect(deps.request).toHaveBeenCalledTimes(1);

    const resume = callbacks();
    resume.poll.mockResolvedValue(job(handle.id, [item], {
      status: 'completed',
      results: [result(item)],
    }));

    expect(await advanceGuideRefreshSession(session, resume)).toBe('done');
    expect(resume.poll).toHaveBeenCalledWith(handle.id);
    expect(resume.request).not.toHaveBeenCalled();
  });

  it('impide solicitudes futuras si se aborta después de una ronda', async () => {
    const controller = new AbortController();
    const session = createGuideRefreshSession([[target(1), target(1, 'fallback')]]);
    const deps = callbacks(controller.signal);
    const item = target(1);
    const handle = job('job-aborted', [item]);
    deps.request.mockResolvedValue({ job: handle });
    deps.poll.mockResolvedValue(job(handle.id, [item], {
      status: 'completed',
      results: [result(item, { state: 'failed', comparable: false, observedAt: FRESH })],
    }));
    deps.onObserved.mockImplementation(async () => controller.abort());

    await expect(advanceGuideRefreshSession(session, deps)).rejects.toThrow();
    expect(deps.request).toHaveBeenCalledTimes(1);
    expect(deps.request).toHaveBeenCalledWith([item]);
  });

  it('rechaza un id de poll distinto y conserva el handle original para reanudar', async () => {
    const session = createGuideRefreshSession([[target(1)]]);
    const deps = callbacks();
    const item = target(1);
    const handle = job('job-original', [item]);
    deps.request.mockResolvedValue({ job: handle });
    deps.poll.mockResolvedValueOnce(job('job-different', [item], { status: 'completed', results: [result(item)] }));

    await expect(advanceGuideRefreshSession(session, deps)).rejects.toThrow('no corresponde');
    expect(session.job?.id).toBe(handle.id);

    deps.poll.mockResolvedValue(job(handle.id, [item], { status: 'completed', results: [result(item)] }));
    expect(await advanceGuideRefreshSession(session, deps)).toBe('done');
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it('permite alternativas cuando el resultado no es elegible o está vencido', async () => {
    const candidates = [target(1), target(1, 'fallback-1'), target(1, 'fallback-2')];
    const session = createGuideRefreshSession([candidates]);
    const deps = callbacks();
    const requested: RefreshTarget[][] = [];
    const outcomes: Partial<RefreshItemResult>[] = [
      { comparable: false },
      { comparable: undefined },
      { comparable: true, observedAt: STALE },
    ];

    deps.request.mockImplementation(async (targets: RefreshTarget[]) => {
      requested.push([...targets]);
      return { job: job(`job-${requested.length}`, targets) };
    });
    deps.poll.mockImplementation(async (id: string) => {
      const index = requested.length - 1;
      return job(id, requested[index], { status: 'completed', results: [result(requested[index][0], outcomes[index])] });
    });

    expect(await advanceGuideRefreshSession(session, deps)).toBe('done');
    expect(requested).toEqual(candidates.map((item) => [item]));
    expect(confirmedGuideRefreshCount(session)).toBe(0);
  });
});
