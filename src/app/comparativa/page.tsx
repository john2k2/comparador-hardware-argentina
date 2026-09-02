import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-config';
import { COMPARISONS } from '@/lib/seo/comparisons-data';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';
import { EditorialUpdatedStamp } from '@/components/seo/EditorialUpdatedStamp';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Comparaciones Hardware',
  description: 'Comparaciones de hardware en Argentina: GPUs, CPUs y más. Encontrá el mejor componente al mejor costo entre 20+ locales.',
  keywords: ['comparativa hardware', 'comparar precios componentes pc', 'mejor placa video', 'mejor procesador gaming'],
  alternates: {
    canonical: `${SITE_URL}/comparativa`,
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/comparativa`,
    modifiedTime: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
  },
};

export const revalidate = 300;

export default function ComparativasIndexPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-[16px] md:text-[20px] font-pixel text-primary mb-3 leading-tight">
          Comparaciones de Hardware
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          Contrastá costos y rendimiento de los componentes más buscados en Argentina.
          Encontrá la mejor opción para tu presupuesto.
        </p>
        <div className="mt-3">
          <EditorialUpdatedStamp isoDate={EDITORIAL_UPDATED_AT} />
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {COMPARISONS.map((comparison) => (
          <Link
            key={comparison.slug}
            href={`/comparativa/${comparison.slug}`}
            className="bg-card border-4 border-border p-5 pixel-shadow hover:border-primary transition-colors group"
          >
            <h2 className="text-[12px] md:text-[14px] font-bold text-primary mb-2 group-hover:text-foreground transition-colors">
              {comparison.product1.name} vs {comparison.product2.name}
            </h2>
            <p className="text-[10px] md:text-[11px] text-muted-foreground font-mono mb-3">
              {comparison.description}
            </p>
            <div className="mt-3 text-[10px] text-primary font-mono">
              VER →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
