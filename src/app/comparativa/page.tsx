import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-config';
import { COMPARISONS } from '@/lib/seo/comparisons-data';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Comparativas de Hardware: Precios y Rendimiento Argentina 2026',
  description: 'Comparativas de placas de video, procesadores y más. Encontrá el mejor hardware al precio más bajo en tiendas de Argentina.',
  keywords: ['comparativa hardware', 'comparar precios componentes pc', 'mejor placa video', 'mejor procesador gaming'],
  alternates: {
    canonical: `${SITE_URL}/comparativa`,
  },
};

export const revalidate = 300;

export default function ComparativasIndexPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-[16px] md:text-[20px] font-pixel text-primary mb-3 leading-tight">
          Comparativas de Hardware
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          Compará precios y rendimiento de los componentes más buscados en Argentina. 
          Encontrá la mejor opción para tu presupuesto.
        </p>
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
            <div className="flex flex-wrap gap-2">
              {comparison.keywords.slice(0, 3).map((keyword) => (
                <span 
                  key={keyword}
                  className="text-[9px] bg-muted px-2 py-1 text-muted-foreground"
                >
                  {keyword}
                </span>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-primary font-mono">
              VER COMPARATIVA →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
