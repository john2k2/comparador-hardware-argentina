import type { Metadata } from 'next';
import Link from 'next/link';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { getOperationalMetricsSnapshot } from '@/lib/telemetry/operational-metrics';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Panel administrativo para monitoreo y control operativo.',
};

export const dynamic = 'force-dynamic';

const cards = [
  { href: '/admin/stores', title: 'TIENDAS', desc: 'Estado actual por tienda, latencia y tasa de exito.' },
  { href: '/admin/scrapers', title: 'SCRAPERS', desc: 'Salud por endpoint y rendimiento de scraping.' },
  { href: '/admin/logs', title: 'LOGS', desc: 'Eventos recientes de /api/search y /api/products.' },
  { href: '/admin/alerts', title: 'ALERTAS', desc: 'Bloqueos, errores repetidos y riesgos de degradacion.' },
];

export default function AdminPage() {
  const snapshot = getOperationalMetricsSnapshot();
  const criticalAlerts = snapshot.alerts.filter((alert) => alert.severity === 'critical').length;
  const warningAlerts = snapshot.alerts.filter((alert) => alert.severity === 'warning').length;
  const activeStores = snapshot.stores.filter((store) => store.status !== 'unknown').length;
  const searchEndpoint = snapshot.endpoints.find((item) => item.endpoint === '/api/search');
  const productsEndpoint = snapshot.endpoints.find((item) => item.endpoint === '/api/products');

  return (
    <RetroPageShell
      title="DASHBOARD ADMIN"
      subtitle={`Actualizado: ${new Date(snapshot.generatedAt).toLocaleString('es-AR')}`}
    >
      <div className="space-y-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-[9px] uppercase text-muted-foreground mb-1">Tiendas con datos</p>
            <p className="text-[14px] font-bold text-secondary">{activeStores}</p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-[9px] uppercase text-muted-foreground mb-1">Alertas criticas</p>
            <p className="text-[14px] font-bold text-red-500">{criticalAlerts}</p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-[9px] uppercase text-muted-foreground mb-1">Alertas warning</p>
            <p className="text-[14px] font-bold text-amber-500">{warningAlerts}</p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-[9px] uppercase text-muted-foreground mb-1">Logs cargados</p>
            <p className="text-[14px] font-bold text-primary">{snapshot.logs.length}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-[10px] uppercase text-secondary font-bold mb-2">/API/SEARCH</p>
            <p className="text-[10px] uppercase text-foreground">
              REQ 24H: {searchEndpoint?.totalRequests24h ?? 0}
            </p>
            <p className="text-[10px] uppercase text-foreground">
              EXITO 24H: {searchEndpoint?.successRate24h ?? 0}%
            </p>
            <p className="text-[10px] uppercase text-foreground">
              P95: {searchEndpoint?.p95LatencyMs24h ?? 0}MS
            </p>
          </div>

          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-[10px] uppercase text-secondary font-bold mb-2">/API/PRODUCTS</p>
            <p className="text-[10px] uppercase text-foreground">
              REQ 24H: {productsEndpoint?.totalRequests24h ?? 0}
            </p>
            <p className="text-[10px] uppercase text-foreground">
              EXITO 24H: {productsEndpoint?.successRate24h ?? 0}%
            </p>
            <p className="text-[10px] uppercase text-foreground">
              P95: {productsEndpoint?.p95LatencyMs24h ?? 0}MS
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="border-2 border-border p-4 bg-muted/30 hover:border-secondary transition-colors"
            >
              <p className="text-[11px] text-secondary font-bold uppercase mb-2">{`[ ${card.title} ]`}</p>
              <p className="text-[10px] uppercase text-foreground leading-relaxed">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </RetroPageShell>
  );
}
