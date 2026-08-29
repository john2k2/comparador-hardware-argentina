'use client';

import { useEffect, useState } from 'react';
import { Shield, Store, Clock } from 'lucide-react';
import { freshnessLabel } from '@/lib/ui/freshness-label';

type ProductActionsProps = { latestSyncAtMs: number };

export function ProductActions({ latestSyncAtMs }: ProductActionsProps) {
  const [label, setLabel] = useState('ACTUALIZADO');

  useEffect(() => {
    setLabel(freshnessLabel(latestSyncAtMs));
  }, [latestSyncAtMs]);

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
        <span>{label}</span>
      </div>
    </div>
  );
}
