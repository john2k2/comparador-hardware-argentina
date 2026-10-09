import type { Metadata } from 'next';
import { COMPARISONS } from '@/lib/seo/comparisons-data';
import { getLatestEditorialReviewDate } from '@/lib/seo/editorial-dates';
import { resolveComparativasHubMetadata } from '@/lib/seo/landing-metadata';
import { EditorialUpdatedStamp } from '@/components/seo/EditorialUpdatedStamp';
import { EditorialLinkCard } from '@/components/seo/EditorialLinkCard';
import Link from 'next/link';

export const metadata: Metadata = resolveComparativasHubMetadata();

export const revalidate = 300;

export default function ComparativasIndexPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-[16px] md:text-[20px] font-pixel text-primary mb-3 leading-tight">
          Comparaciones de Hardware
        </h1>
        <p className="text-[12px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          Contrastá costos y rendimiento de los componentes más buscados en Argentina.
          Encontrá la mejor opción para tu presupuesto.
        </p>
        <div className="mt-3">
          <EditorialUpdatedStamp isoDate={getLatestEditorialReviewDate(COMPARISONS.map((comparison) => comparison.slug))} />
        </div>
      </header>

      <section className="mb-8 border-4 border-primary bg-primary/10 p-5 pixel-shadow md:p-6">
        <p className="text-[12px] font-bold text-muted-foreground">NUEVO COMPARADOR ABIERTO</p>
        <h2 className="mt-2 text-[13px] font-bold text-primary">Elegí cualquier producto del catálogo</h2>
        <p className="mt-3 text-[12px] font-mono leading-relaxed">
          Compará dos componentes del mismo tipo por precio actual, ofertas, especificaciones y compatibilidad informada.
        </p>
        <Link href="/comparativa/comparar" className="mt-4 inline-flex min-h-11 items-center border-2 border-primary bg-primary px-4 text-[12px] font-bold text-primary-foreground hover:bg-primary/90">
          ARMAR COMPARACIÓN →
        </Link>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        {COMPARISONS.map((comparison) => (
          <EditorialLinkCard
            key={comparison.slug}
            href={`/comparativa/${comparison.slug}`}
            title={`${comparison.product1.name} vs ${comparison.product2.name}`}
            description={comparison.description}
            actionLabel="Ver comparativa"
            headingLevel={2}
          />
        ))}
      </div>
    </div>
  );
}
