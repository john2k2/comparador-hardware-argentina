'use client';

import { Shield, Store, Clock } from 'lucide-react';

type ProductActionsProps = { latestSyncAtMs: number };

function freshnessLabel(timestamp: number): string {
  const ageHours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (!Number.isFinite(ageHours) || timestamp <= 0) return 'ACTUALIZACION NO DISPONIBLE';
  if (ageHours < 1) return 'ACTUALIZADO HACE MENOS DE 1 HORA';
  if (ageHours < 24) return `ACTUALIZADO HACE ${ageHours} H`;
  return `ACTUALIZADO HACE ${Math.floor(ageHours / 24)} D`;
}

export function ProductActions({ latestSyncAtMs }: ProductActionsProps) {
  return (
    <div className="flex flex-wrap gap-4 text-[8px] uppercase font-bold text-foreground/80 p-4 bg-muted border-4 border-border">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <span>GARANTIA SEGUN TIENDA</span>
      </div>
      <div className="flex items-center gap-2">
        <Store className="w-4 h-4 text-secondary" />
        <span>ENLACE A TIENDA</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-accent" />
        <span suppressHydrationWarning>{freshnessLabel(latestSyncAtMs)}</span>
      </div>
    </div>
  );
}
