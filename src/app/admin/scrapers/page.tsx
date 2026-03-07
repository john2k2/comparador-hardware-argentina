import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { getOperationalMetricsSnapshot } from '@/lib/telemetry/operational-metrics';

export const metadata: Metadata = {
  title: 'Admin Scrapers',
  description: 'Salud de scrapers y rendimiento por endpoint.',
};

export const dynamic = 'force-dynamic';

export default function AdminScrapersPage() {
  const snapshot = getOperationalMetricsSnapshot();
  const slowestStores = [...snapshot.stores]
    .filter((store) => store.avgLatencyMs24h !== null)
    .sort((a, b) => (b.avgLatencyMs24h ?? 0) - (a.avgLatencyMs24h ?? 0))
    .slice(0, 6);
  const blockedStores = snapshot.stores.filter((store) => store.status === 'blocked');

  return (
    <RetroPageShell
      title="ADMIN SCRAPERS"
      subtitle={`Rendimiento operativo. Actualizado: ${new Date(snapshot.generatedAt).toLocaleString('es-AR')}`}
    >
      <div className="space-y-4 text-[10px] uppercase">
        <div className="grid md:grid-cols-2 gap-4">
          {snapshot.endpoints.map((endpoint) => (
            <div key={endpoint.endpoint} className="border-2 border-border p-4 bg-muted/30 space-y-2">
              <p className="text-secondary font-bold">{endpoint.endpoint}</p>
              <p className="text-foreground">Req 24h: {endpoint.totalRequests24h}</p>
              <p className="text-foreground">Exito 24h: {endpoint.successRate24h}%</p>
              <p className="text-foreground">Latencia media: {endpoint.avgLatencyMs24h}ms</p>
              <p className="text-foreground">P95: {endpoint.p95LatencyMs24h}ms</p>
              <p className="text-foreground">Errores 24h: {endpoint.errorCount24h}</p>
              <p className="text-muted-foreground">
                Ultima ejecucion: {endpoint.lastRequestAt ? new Date(endpoint.lastRequestAt).toLocaleString('es-AR') : 'sin datos'}
              </p>
            </div>
          ))}
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ TIENDAS MAS LENTAS ]</p>
          {slowestStores.length === 0 && <p className="text-muted-foreground">Sin datos suficientes de latencia.</p>}
          <div className="space-y-1">
            {slowestStores.map((store) => (
              <p key={store.storeId} className="text-foreground">
                {store.storeName}: {store.avgLatencyMs24h}ms (estado actual {store.status})
              </p>
            ))}
          </div>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ BLOQUEOS ACTIVOS ]</p>
          {blockedStores.length === 0 && <p className="text-muted-foreground">No hay tiendas bloqueadas en este momento.</p>}
          <div className="space-y-1">
            {blockedStores.map((store) => (
              <p key={store.storeId} className="text-red-500">
                {store.storeName} ({store.storeId}) ultimo check {store.lastCheckedAt ? new Date(store.lastCheckedAt).toLocaleString('es-AR') : '-'}
              </p>
            ))}
          </div>
        </div>
      </div>
    </RetroPageShell>
  );
}
