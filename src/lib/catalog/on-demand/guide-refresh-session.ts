import { MAX_GUIDE_REFRESH_ROUNDS, parseRefreshTargets, type RefreshItemResult, type RefreshJob, type RefreshTarget } from './contracts';
import { isOfferFresh } from '@/lib/price-freshness';

export type GuideRefreshSession = {
  groups: RefreshTarget[][];
  attempted: RefreshTarget[];
  results: RefreshItemResult[];
  rounds: number;
  job: RefreshJob | null;
};
type GuideRefreshDependencies = {
  signal: AbortSignal;
  request: (targets: RefreshTarget[]) => Promise<{ job: RefreshJob; dispatch?: string }>;
  poll: (id: string) => Promise<RefreshJob>;
  wait: () => Promise<void>;
  onJob: (job: RefreshJob | null, round: number) => void;
  onObserved: () => Promise<void>;
};

const sameTarget = (first: RefreshTarget, second: RefreshTarget) => first.productId === second.productId
  && first.storeId === second.storeId && first.url === second.url;
const active = (job: RefreshJob) => job.status === 'queued' || job.status === 'running';
const confirmed = (result: RefreshItemResult) => result.state === 'updated' && result.comparable === true && isOfferFresh(result.observedAt);

export function createGuideRefreshSession(groups: RefreshTarget[][]): GuideRefreshSession {
  if (groups.length < 1 || groups.length > 8 || groups.some(group => group.length < 1 || !parseRefreshTargets(group))) {
    throw new Error('No hay una selección válida de publicaciones para comprobar.');
  }
  return { groups: groups.map(group => parseRefreshTargets(group)!.slice(0, MAX_GUIDE_REFRESH_ROUNDS)),
    attempted: [], results: [], rounds: 0, job: null };
}

export function confirmedGuideRefreshCount(session: GuideRefreshSession): number {
  return session.groups.filter(group => session.results.some(result => confirmed(result)
    && group.some(target => sameTarget(result, target)))).length;
}

export function nextGuideRefreshTargets(session: GuideRefreshSession): RefreshTarget[] {
  const targets = session.groups.flatMap(group => {
    if (session.results.some(result => confirmed(result) && group.some(target => sameTarget(result, target)))) return [];
    const next = group.find(target => !session.attempted.some(attempt => sameTarget(attempt, target)));
    return next ? [next] : [];
  });
  return targets.length ? parseRefreshTargets(targets)! : [];
}

/** Una solicitud a la vez; un sondeo vencido conserva el mismo job para reanudarlo. */
export async function advanceGuideRefreshSession(session: GuideRefreshSession, deps: GuideRefreshDependencies): Promise<'done' | 'pending' | 'deferred'> {
  while (session.job || session.rounds < MAX_GUIDE_REFRESH_ROUNDS) {
    deps.signal.throwIfAborted();
    if (!session.job) {
      const targets = nextGuideRefreshTargets(session);
      if (!targets.length) return 'done';
      const requested = await deps.request(targets);
      // Guardamos la solicitud aceptada aunque se cierre la vista en ese instante.
      session.job = requested.job;
      session.attempted.push(...targets);
      session.rounds++;
      deps.signal.throwIfAborted();
      deps.onJob(session.job, session.rounds);
      if (requested.dispatch === 'unavailable' && active(session.job)) return 'deferred';
    }
    for (let poll = 0; active(session.job) && poll < 60; poll++) {
      await deps.wait();
      deps.signal.throwIfAborted();
      const updated = await deps.poll(session.job.id);
      if (updated.id !== session.job.id) throw new Error('El estado recibido no corresponde a esta solicitud.');
      session.job = updated;
      deps.onJob(session.job, session.rounds);
    }
    if (active(session.job)) return 'pending';
    for (const result of session.job.results) {
      if (!session.job.targets.some(target => sameTarget(target, result))) continue;
      const prior = session.results.findIndex(item => sameTarget(item, result));
      if (prior < 0) session.results.push(result);
      else session.results[prior] = result;
    }
    if (session.job.results.some(result => result.observedAt !== null)) await deps.onObserved();
    deps.signal.throwIfAborted();
    session.job = null;
    deps.onJob(null, session.rounds);
  }
  return 'done';
}
