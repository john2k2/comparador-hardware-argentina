'use client';

import Link from 'next/link';
import type { Store } from '@/lib/types';
import { trackSponsoredStoreSelection } from '@/lib/analytics';
import { CommercialDisclosure } from '@/components/functional/CommercialDisclosure';

type SponsoredStoresSectionProps = {
  stores: Store[];
};

export function SponsoredStoresSection({ stores }: SponsoredStoresSectionProps) {
  if (stores.length === 0) return null;

  return (
    <section className="mt-10 border-[3px] border-primary bg-card pixel-shadow p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-[0.2em] text-primary font-bold">
            ESPACIO PATROCINADO
          </p>
          <h3 className="mt-2 text-[12px] md:text-[14px] uppercase font-bold text-foreground">
            TIENDAS DESTACADAS DENTRO DEL COMPARADOR
          </h3>
          <p className="mt-2 text-[10px] md:text-[11px] leading-relaxed normal-case tracking-normal text-muted-foreground font-mono">
            Este bloque es comercial y opcional. Aun asi, te lleva a una vista filtrada dentro del comparador para que sigas viendo contexto y no un link ciego.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {stores.map((store, index) => (
          <Link
            key={store.id}
            href={`/search?stores=${encodeURIComponent(store.id)}`}
            onClick={() => {
              trackSponsoredStoreSelection({
                storeId: store.id,
                storeName: store.name,
                position: index + 1,
                surface: 'home_sponsored',
              });
            }}
            className="border-2 border-primary bg-primary/10 px-4 py-4 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <p className="text-[8px] uppercase tracking-[0.18em] font-bold text-primary">PATROCINADO</p>
            <p className="mt-2 text-[12px] uppercase font-bold">{store.name}</p>
            <p className="mt-2 text-[9px] uppercase text-muted-foreground">
              VER PRODUCTOS DE ESTA TIENDA EN EL COMPARADOR
            </p>
          </Link>
        ))}
      </div>

      <CommercialDisclosure className="mt-4" compact />
    </section>
  );
}

export default SponsoredStoresSection;
