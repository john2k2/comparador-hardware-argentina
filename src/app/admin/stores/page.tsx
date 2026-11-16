import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { getOperationalMetricsSnapshot, StoreHealthStatus } from '@/lib/telemetry/operational-metrics';

export const metadata: Metadata = {
  title: 'Admin Tiendas',
  description: 'Estado operativo por tienda y metricas de scraping.',
};

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<StoreHealthStatus, string> = {
  ok: 'OK',
  slow: 'LENTO',
  blocked: 'BLOQUEADA',
  'no-results': 'SIN RESULTADOS',
  error: 'ERROR',
  unknown: 'SIN DATOS',
};

const STATUS_CLASS: Record<StoreHealthStatus, string> = {
  ok: 'border-emerald-500 text-emerald-500',
  slow: 'border-amber-500 text-amber-500',
  blocked: 'border-red-500 text-red-500',
  'no-results': 'border-orange-500 text-orange-500',
  error: 'border-red-500 text-red-500',
  unknown: 'border-muted-foreground text-muted-foreground',
};

export default async function AdminStoresPage() {
  const snapshot = await getOperationalMetricsSnapshot();

  return (
    <RetroPageShell
      title="ADMIN TIENDAS"
      subtitle={`Monitoreo en vivo por tienda. Actualizado: ${new Date(snapshot.generatedAt).toLocaleString('es-AR')}`}
    >
      <div className="space-y-3">
        {snapshot.stores.map((store) => (
          <div key={store.storeId} className="border-2 border-border p-4 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase font-bold text-secondary">{store.storeName}</p>
                <p className="text-[9px] uppercase text-muted-foreground">{store.storeId}</p>
              </div>
              <span className={`text-[9px] uppercase border-2 px-2 py-1 ${STATUS_CLASS[store.status]}`}>
                {STATUS_LABEL[store.status]}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[9px] uppercase">
              <p className="text-foreground">Checks 24h: {store.totalChecks24h}</p>
              <p className="text-foreground">Exito 24h: {store.successRate24h}%</p>
              <p className="text-foreground">Latencia media: {store.avgLatencyMs24h ?? '-'}ms</p>
              <p className="text-foreground">Ultimo resultado: {store.lastResultCount ?? '-'}</p>
              <p className="text-foreground">Bloqueos: {store.blockedCount24h}</p>
              <p className="text-foreground">Errores: {store.errorCount24h}</p>
              <p className="text-foreground">Sin resultados: {store.noResultsCount24h}</p>
              <p className="text-foreground">Endpoint: {store.lastEndpoint ?? '-'}</p>
            </div>

            <p className="text-[9px] uppercase text-muted-foreground">
              Ultimo check: {store.lastCheckedAt ? new Date(store.lastCheckedAt).toLocaleString('es-AR') : 'SIN EJECUCIONES'}
            </p>

            {store.recentFailures.length > 0 && (
              <div className="border border-border p-2 bg-background/50 space-y-1">
                <p className="text-[9px] uppercase text-red-500 font-bold">Ultimos fallos</p>
                {store.recentFailures.slice(0, 3).map((failure) => (
                  <p key={`${store.storeId}-${failure.at}-${failure.endpoint}`} className="text-[9px] uppercase text-muted-foreground">
                    {new Date(failure.at).toLocaleString('es-AR')} | {failure.endpoint} | {failure.status}
                    {failure.httpStatus ? ` ${failure.httpStatus}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </RetroPageShell>
  );
}
