'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshOffersButton } from '@/components/pc-builder/RefreshOffersButton';
import type { RefreshTarget } from '@/lib/catalog/on-demand/contracts';

export function GuideRefreshPanel({ targets }: { targets: RefreshTarget[] }) {
  const router = useRouter();
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retry.current) clearTimeout(retry.current); }, []);

  async function onUpdated() {
    router.refresh();
    if (retry.current) clearTimeout(retry.current);
    // La guía usa una lectura compartida de cinco minutos para proteger al Worker.
    retry.current = setTimeout(() => router.refresh(), 5 * 60 * 1000);
  }

  return (
    <section className="border-4 border-secondary bg-card p-5 md:p-6 pixel-shadow mb-8" aria-label="Actualizar precios del presupuesto">
      <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-secondary mb-3">[ ACTUALIZAR PRECIOS DEL PRESUPUESTO ]</h2>
      <p className="font-body text-xs leading-relaxed mb-4">Comprobamos las publicaciones conocidas de estas piezas a pedido. El proceso puede demorar varios minutos; solo una respuesta nueva de la tienda cambia la fecha y el precio. La lista de compra incluye únicamente ofertas disponibles que pudimos comprobar.</p>
      {targets.length > 0 ? (
        <>
          <RefreshOffersButton targets={targets} onUpdated={onUpdated} actionLabel={`Comprobar ${targets.length} ${targets.length === 1 ? 'publicación' : 'publicaciones'}`} />
          <p className="font-body text-xs text-muted-foreground mt-3">La guía puede tardar hasta cinco minutos adicionales en reflejar el resultado por su caché. Confirmá siempre el precio final en la tienda.</p>
        </>
      ) : (
        <p className="font-body text-xs text-muted-foreground">No hay publicaciones conocidas de estas piezas para volver a consultar. Explorá el catálogo o pedinos ayuda desde Contacto.</p>
      )}
    </section>
  );
}
