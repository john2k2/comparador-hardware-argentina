'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefreshJob, RefreshTarget } from '@/lib/catalog/on-demand/contracts';

const active = (job: RefreshJob) => job.status === 'queued' || job.status === 'running';
function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 5000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
export function RefreshOffersButton({ targets, onUpdated, onActivity, actionLabel = 'Actualizar estas ofertas' }: {
  targets: RefreshTarget[];
  onUpdated: () => Promise<void>;
  onActivity?: (action: 'refresh_requested' | 'refresh_result', status?: string, updatedCount?: number) => void;
  actionLabel?: string;
}) {
  const [job, setJob] = useState<RefreshJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function run() {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage('');
    try {
      let current = job && active(job) ? job : null;
      if (!current) {
        onActivity?.('refresh_requested');
        const response = await fetch('/api/catalog/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo pedir la actualización.');
        current = result.job as RefreshJob; setJob(current);
      }
      for (let poll = 0; current && active(current) && poll < 60; poll++) {
        await waitForPoll(abort.signal);
        const response = await fetch(`/api/catalog/refresh?id=${encodeURIComponent(current.id)}`, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo consultar el estado.');
        current = result.job as RefreshJob; setJob(current);
      }
      if (current && !active(current)) {
        onActivity?.('refresh_result', current.status, current.results.filter((item) => item.state === 'updated').length);
        if (current.status === 'completed' || current.status === 'partial') {
          await onUpdated();
          const updated = current.results.filter((item) => item.state === 'updated').length;
          const unavailable = current.results.filter((item) => item.state === 'unavailable').length;
          setMessage(`${updated} ofertas actualizadas${unavailable ? `; ${unavailable} sin stock` : ''}.${current.status === 'partial' ? ' Algunas tiendas no respondieron; conservamos sus fechas anteriores.' : ''}`);
        } else setMessage('No se pudieron confirmar nuevos datos. Conservamos los precios con su fecha anterior; podés volver a intentarlo.');
      } else setMessage('La solicitud sigue en cola. Podés consultar el estado nuevamente en unos minutos.');
    } catch (error) {
      if (!abort.signal.aborted) {
        onActivity?.('refresh_result', 'error', 0);
        setMessage(error instanceof Error ? error.message : 'No se pudo completar la solicitud.');
      }
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  const pending = job && active(job);
  return <div className="space-y-2">
    <button type="button" onClick={() => void run()} disabled={busy || targets.length === 0}
      className="pixel-button w-full disabled:opacity-50 disabled:cursor-not-allowed text-xs">
      {busy ? 'Consultando actualización…' : pending ? 'Consultar estado' : actionLabel}
    </button>
    <div role="status" aria-live="polite" className="font-body text-xs leading-relaxed">
      {busy && pending && <p>{job.status === 'queued' ? 'Solicitud en cola. Puede demorar varios minutos.' : 'Consultando las tiendas seleccionadas…'}</p>}
      {message && <p>{message}</p>}
    </div>
    <p className="font-body text-xs text-muted-foreground">Se revisan estas ofertas. La fecha de cada precio cambia sólo cuando llegan datos nuevos de la tienda.</p>
  </div>;
}
