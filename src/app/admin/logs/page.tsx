import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { getOperationalMetricsSnapshot } from '@/lib/telemetry/operational-metrics';

export const metadata: Metadata = {
  title: 'Admin Logs',
  description: 'Eventos operativos recientes del sistema.',
};

export const dynamic = 'force-dynamic';

const LEVEL_CLASS = {
  info: 'text-secondary',
  warning: 'text-amber-500',
  error: 'text-red-500',
} as const;

export default function AdminLogsPage() {
  const snapshot = getOperationalMetricsSnapshot();

  return (
    <RetroPageShell
      title="ADMIN LOGS"
      subtitle={`Eventos recientes de /api/search y /api/products. Actualizado: ${new Date(snapshot.generatedAt).toLocaleString('es-AR')}`}
    >
      <div className="space-y-2">
        {snapshot.logs.length === 0 && (
          <div className="border-2 border-border p-3 bg-muted/30 text-[10px] uppercase text-muted-foreground">
            SIN EVENTOS AUN. EJECUTA BUSQUEDAS PARA POBLAR EL LOG.
          </div>
        )}

        {snapshot.logs.slice(0, 120).map((line) => (
          <div key={line.id} className="border-2 border-border p-3 bg-muted/30 text-[10px] uppercase">
            <p className={`font-bold ${LEVEL_CLASS[line.level]}`}>{line.level} | {line.source} | {line.endpoint}</p>
            <p className="text-foreground">{line.message}</p>
            <p className="text-muted-foreground">
              {new Date(line.timestamp).toLocaleString('es-AR')} | LAT {line.latencyMs}MS | ITEMS {line.resultCount}
              {line.statusCode ? ` | HTTP ${line.statusCode}` : ''}
            </p>
          </div>
        ))}
      </div>
    </RetroPageShell>
  );
}
