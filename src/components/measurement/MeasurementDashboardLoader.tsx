'use client';
import { useEffect, useState } from 'react';
import type { MeasurementDashboard } from '@/lib/measurement/types';
import { MeasurementDashboardView } from './MeasurementDashboardView';

export function MeasurementDashboardLoader() {
  const [dashboard, setDashboard] = useState<MeasurementDashboard | null>(null);
  const [issue, setIssue] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/measurement', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? 'Ingresá con una cuenta de administrador para ver el seguimiento.' : 'No se pudo leer el seguimiento guardado. Volvé a cargar la página.');
        return response.json() as Promise<MeasurementDashboard>;
      }).then(setDashboard).catch((error) => { if (!controller.signal.aborted) setIssue(error instanceof Error ? error.message : 'No se pudo leer el seguimiento.'); });
    return () => controller.abort();
  }, []);
  if (!dashboard) return <div className="container mx-auto px-4 py-12 font-mono"><h1 className="font-pixel text-[16px]">Seguimiento del proyecto</h1><p className="mt-5" role={issue ? 'alert' : 'status'}>{issue || 'Leyendo los resultados guardados…'}</p>{issue && <a className="underline" href="/auth?next=%2Fadmin%2Fseguimiento">Ingresar</a>}</div>;
  const result = new URLSearchParams(window.location.search).get('google') ?? undefined;
  return <MeasurementDashboardView initialDashboard={dashboard} googleResult={result} />;
}
