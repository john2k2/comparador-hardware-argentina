'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { JOB_ID_PATTERN, parseRefreshTargets, type RefreshJob, type RefreshTarget } from '@/lib/catalog/on-demand/contracts';
import { advanceGuideRefreshSession, confirmedGuideRefreshCount, createGuideRefreshSession, type GuideRefreshSession } from '@/lib/catalog/on-demand/guide-refresh-session';

function readJob(value: unknown): RefreshJob {
  const job = (value as { job?: RefreshJob } | null)?.job;
  if (!job || typeof job.id !== 'string' || !JOB_ID_PATTERN.test(job.id) || !parseRefreshTargets(job.targets)
    || !Array.isArray(job.results) || !['queued', 'running', 'completed', 'partial', 'failed'].includes(job.status)) {
    throw new Error('No pudimos comprobar el estado de la solicitud.');
  }
  return job;
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 5000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function GuideRefreshPanel({ groups }: { groups: RefreshTarget[][] }) {
  const router = useRouter();
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<GuideRefreshSession | null>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<RefreshJob | null>(null);
  const [round, setRound] = useState(0);
  const [message, setMessage] = useState('');
  useEffect(() => () => {
    controller.current?.abort();
    if (retry.current) clearTimeout(retry.current);
  }, []);

  async function onUpdated() {
    router.refresh();
    if (retry.current) clearTimeout(retry.current);
    // La guía usa una lectura compartida de cinco minutos para proteger al Worker.
    retry.current = setTimeout(() => router.refresh(), 5 * 60 * 1000);
  }

  async function run() {
    if (running.current) return;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setMessage('');
    try {
      if (!session.current) setRound(0);
      session.current ??= createGuideRefreshSession(groups);
      const current = session.current;
      const outcome = await advanceGuideRefreshSession(current, {
        signal: abort.signal,
        request: async targets => {
          const response = await fetch('/api/catalog/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targets }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]) });
          const result = await response.json();
          if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'No se pudo pedir la comprobación.');
          return { job: readJob(result), dispatch: result.dispatch };
        },
        poll: async id => {
          const response = await fetch(`/api/catalog/refresh?id=${encodeURIComponent(id)}`, { cache: 'no-store',
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]) });
          const result = await response.json();
          if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'No se pudo consultar el estado.');
          return readJob(result);
        },
        wait: () => waitForPoll(abort.signal),
        onJob: (updated, attempt) => { setJob(updated); setRound(attempt); },
        onObserved: onUpdated,
      });
      if (outcome === 'done') {
        const count = confirmedGuideRefreshCount(current);
        setMessage(`${count} ${count === 1 ? 'pieza con oferta actualizada' : 'piezas con ofertas actualizadas'}.${count < current.groups.length ? ' Algunas piezas siguen pendientes de una oferta comprobada.' : ''}`);
        session.current = null;
      } else if (outcome === 'deferred') {
        setMessage('La comprobación inmediata no está disponible. La solicitud quedó en cola; podés consultar su estado más tarde.');
      } else setMessage('La solicitud sigue en curso. Podés consultar el estado nuevamente en unos minutos.');
    } catch (error) {
      if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'No se pudo completar la comprobación.');
    } finally {
      running.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  const pending = job && (job.status === 'queued' || job.status === 'running');

  return (
    <section className="border-4 border-secondary bg-card p-5 md:p-6 pixel-shadow mb-8" aria-label="Actualizar precios del presupuesto">
      <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-secondary mb-3">[ ACTUALIZAR PRECIOS DEL PRESUPUESTO ]</h2>
      <p className="font-body text-xs leading-relaxed mb-4">Comprobamos las publicaciones conocidas de estas piezas a pedido. Si una no tiene una oferta válida, buscamos una alternativa conocida cuando existe. Solo una respuesta nueva de la tienda cambia la fecha y el precio.</p>
      {groups.length > 0 ? (
        <>
          <div className="space-y-2">
            <button type="button" onClick={() => void run()} disabled={busy}
              className="pixel-button w-full disabled:opacity-50 disabled:cursor-not-allowed text-xs">
              {busy ? 'Comprobando publicaciones…' : pending ? 'Consultar estado' : `Comprobar ${groups.length} ${groups.length === 1 ? 'pieza' : 'piezas'}`}
            </button>
            <div role="status" aria-live="polite" className="font-body text-xs leading-relaxed">
              {busy && <p>{round > 1 ? 'Comprobando alternativas para las piezas pendientes…' : 'La comprobación puede demorar varios minutos.'}</p>}
              {message && <p>{message}</p>}
            </div>
          </div>
          <p className="font-body text-xs text-muted-foreground mt-3">La lista incluye solo ofertas disponibles observadas recientemente. La guía puede tardar hasta cinco minutos adicionales en reflejar el resultado. Confirmá siempre el precio final y el envío en la tienda.</p>
        </>
      ) : (
        <p className="font-body text-xs text-muted-foreground">No hay publicaciones conocidas de estas piezas para volver a consultar. Explorá el catálogo o pedinos ayuda desde Contacto.</p>
      )}
    </section>
  );
}
