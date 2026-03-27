import type { Metadata } from 'next';
import Link from 'next/link';
import { CommercialDisclosure } from '@/components/functional/CommercialDisclosure';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { SITE_NAME } from '@/lib/site-config';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/acerca',
  title: 'Acerca de',
  description: `${SITE_NAME} compara precios de hardware entre multiples tiendas de Argentina para ayudarte a decidir mejor antes de comprar.`,
});

export default function AcercaPage() {
  return (
    <RetroPageShell
      title="ACERCA DEL PROYECTO"
      subtitle={`${SITE_NAME} centraliza resultados de multiples tiendas para facilitar comparacion de precios antes de salir a comprar.`}
    >
      <div className="space-y-6 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="leading-relaxed normal-case text-[11px] md:text-[12px] tracking-normal font-mono">
            {SITE_NAME} no vende hardware ni procesa pagos. Su trabajo es ordenar resultados, comparar precios y mostrarte enlaces claros a tiendas argentinas para que puedas decidir con mas contexto y menos ruido.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ MISION ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Ahorrarte tiempo al concentrar precios, stock y enlaces de compra en un solo lugar.
            </p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ FOCO ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Priorizar comparacion util: mismo producto, multiples tiendas, mejor contexto antes del clic final.
            </p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ ESTADO ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Proyecto activo, todavia en mejora de scrapers, cobertura de tiendas y consistencia de datos.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ COMO FUNCIONA ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Indexamos productos, agrupamos coincidencias, ordenamos mejores precios por tienda y te redirigimos al comercio elegido para completar la compra.
            </p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ LIMITES ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Los precios, cuotas y stock pueden cambiar entre la ultima captura y tu visita final a la tienda. Siempre vale el dato del comercio de destino.
            </p>
          </div>
        </div>

        <CommercialDisclosure />

        <div className="pt-2">
          <Link href="/search" className="pixel-button inline-block">
            {'< IR A BUSCAR >'}
          </Link>
        </div>
      </div>
    </RetroPageShell>
  );
}
