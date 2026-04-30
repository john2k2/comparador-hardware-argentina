import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-config';
import { BUDGET_GUIDES } from '@/lib/seo/budget-guides-data';
import { formatPriceARS } from '@/lib/price-utils';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Guías PC Gamer Argentina',
  description: 'Armá tu PC gamer según presupuesto. Configuraciones recomendadas desde $1.000.000 con precios actualizados de 20+ tiendas.',
  keywords: ['guia pc gamer', 'armar pc argentina', 'pc gamer presupuesto', 'configuracion pc gaming'],
  alternates: {
    canonical: `${SITE_URL}/guia`,
  },
};

export const revalidate = 300;

export default function GuiasIndexPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-[16px] md:text-[20px] font-pixel text-primary mb-3 leading-tight">
          Guías de PC Gamer
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          Armá la mejor PC gamer según tu presupuesto. Componentes seleccionados 
          por precio/calidad con precios actualizados de 20+ tiendas.
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6">
        {BUDGET_GUIDES.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guia/${guide.slug}`}
            className="bg-card border-4 border-border p-5 pixel-shadow hover:border-primary transition-colors group"
          >
            <div className="text-[10px] text-muted-foreground mb-2">PRESUPUESTO</div>
            <div className="text-[20px] md:text-[24px] font-pixel text-primary mb-3">
              {formatPriceARS(guide.budget)}
            </div>
            
            <p className="text-[10px] md:text-[11px] text-muted-foreground font-mono mb-3">
              {guide.description}
            </p>
            
            <div className="text-[10px] font-mono mb-3">
              <div className="text-muted-foreground">RENDIMIENTO:</div>
              <div className="text-foreground">{guide.performance}</div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {guide.keywords.slice(0, 2).map((keyword) => (
                <span 
                  key={keyword}
                  className="text-[9px] bg-muted px-2 py-1 text-muted-foreground"
                >
                  {keyword}
                </span>
              ))}
            </div>
            
            <div className="mt-3 text-[10px] text-primary font-mono">
              VER GUÍA →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
