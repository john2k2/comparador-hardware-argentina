import type { Metadata } from 'next';
import Link from 'next/link';
import { RetroPageShell } from '@/components/layout/RetroPageShell';

export const metadata: Metadata = {
  title: 'Acerca de',
  description: 'Informacion general del proyecto Comparador Hardware Argentina.',
};

export default function AcercaPage() {
  return (
    <RetroPageShell
      title="ACERCA DEL PROYECTO"
      subtitle="Comparador Hardware Argentina centraliza resultados de multiples tiendas para facilitar comparacion de precios."
    >
      <div className="space-y-6 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="leading-relaxed">
            Este proyecto busca ayudarte a encontrar hardware al mejor precio en tiendas de Argentina, con un estilo de interfaz retro y foco en velocidad.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ MISION ]</p>
            <p className="leading-relaxed">Ahorrar tiempo al comparar opciones de compra en un solo lugar.</p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ FOCO ]</p>
            <p className="leading-relaxed">Busqueda rapida, filtros utiles y detalle por producto.</p>
          </div>
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ ESTADO ]</p>
            <p className="leading-relaxed">Proyecto activo, en mejora continua de scrapers y monitoreo.</p>
          </div>
        </div>

        <div className="pt-2">
          <Link href="/search" className="pixel-button inline-block">
            {'< IR A BUSCAR >'}
          </Link>
        </div>
      </div>
    </RetroPageShell>
  );
}
