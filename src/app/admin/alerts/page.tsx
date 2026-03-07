import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { getOperationalMetricsSnapshot } from '@/lib/telemetry/operational-metrics';

export const metadata: Metadata = {
  title: 'Admin Alertas',
  description: 'Alertas operativas por bloqueos y degradaciones de rendimiento.',
};

export const dynamic = 'force-dynamic';

const SEVERITY_CLASS = {
  info: 'border-sky-500 text-sky-500',
  warning: 'border-amber-500 text-amber-500',
  critical: 'border-red-500 text-red-500',
} as const;

export default function AdminAlertsPage() {
  const snapshot = getOperationalMetricsSnapshot();
  const sortedAlerts = [...snapshot.alerts].sort(
    (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
  );

  return (
    <RetroPageShell
      title="ADMIN ALERTAS"
      subtitle={`Reglas activas de salud operativa. Actualizado: ${new Date(snapshot.generatedAt).toLocaleString('es-AR')}`}
    >
      <div className="space-y-3">
        {sortedAlerts.length === 0 && (
          <div className="border-2 border-border p-6 bg-muted/30 text-center">
            <p className="text-[11px] uppercase font-bold text-secondary mb-2">[ SIN ALERTAS ACTIVAS ]</p>
            <p className="text-[10px] uppercase text-muted-foreground">No se detectaron bloqueos ni degradaciones recientes.</p>
          </div>
        )}

        {sortedAlerts.map((alert) => (
          <div key={alert.id} className="border-2 border-border p-4 bg-muted/30">
            <div className="flex items-center justify-between gap-4 mb-2">
              <span className={`text-[9px] uppercase border-2 px-2 py-1 ${SEVERITY_CLASS[alert.severity]}`}>
                {alert.severity}
              </span>
              <p className="text-[9px] uppercase text-muted-foreground">
                {new Date(alert.triggeredAt).toLocaleString('es-AR')}
              </p>
            </div>
            <p className="text-[10px] uppercase text-foreground">{alert.message}</p>
            <p className="text-[9px] uppercase text-muted-foreground mt-1">
              Scope: {alert.scope}
              {alert.storeId ? ` | Store: ${alert.storeId}` : ''}
              {alert.endpoint ? ` | Endpoint: ${alert.endpoint}` : ''}
              {` | Metric: ${alert.metric}`}
            </p>
          </div>
        ))}
      </div>
    </RetroPageShell>
  );
}
