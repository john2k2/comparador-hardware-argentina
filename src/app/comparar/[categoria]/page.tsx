import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SearchExperience } from '@/components/search/SearchExperience';
import { BuilderCta } from '@/components/seo/BuilderCta';
import { buildCategoryLandingState } from '@/lib/search/category-landing-state';
import {
  listCategoryLandingSlugs,
  resolveCategoryFromLandingSlug,
} from '@/lib/seo/category-landing-routes';
import { resolveCategoryLandingPageMetadata } from '@/lib/seo/landing-metadata';

type CategoryLandingProps = {
  params: Promise<{ categoria: string }>;
};

export const revalidate = 120;

export function generateStaticParams() {
  return listCategoryLandingSlugs().map((categoria) => ({ categoria }));
}

export async function generateMetadata({ params }: CategoryLandingProps): Promise<Metadata> {
  return resolveCategoryLandingPageMetadata((await params).categoria);
}

export default async function CategoryLandingPage({ params }: CategoryLandingProps) {
  const category = resolveCategoryFromLandingSlug((await params).categoria);

  if (!category) {
    notFound();
  }

  return <>
    {category === 'procesadores' && <section className="container mx-auto px-4 pt-6" aria-label="Comparación de procesadores por modelo y precio">
      <div className="border-2 border-border bg-card p-4 md:p-6">
        <h2 className="font-pixel text-xs leading-relaxed text-primary">¿Qué cambia entre dos procesadores?</h2>
        <p className="font-body text-sm mt-3 mb-4">Elegí dos modelos AMD o Intel y revisá sus datos técnicos, socket y ofertas para tu uso. Para decidir una compra, sumá el costo de motherboard, RAM y refrigeración; el precio del procesador es sólo una parte. La comparación no sustituye pruebas de rendimiento.</p>
        <Link href="/comparativa/comparar" prefetch={false} className="pixel-button inline-flex min-h-11 items-center text-xs">Comparar dos procesadores →</Link>
        <p className="font-body text-xs text-muted-foreground mt-3">Más abajo podés buscar precios por modelo y entrar a cada tienda para confirmar stock y condiciones de pago.</p>
      </div>
    </section>}
    <SearchExperience state={buildCategoryLandingState(category)} />
    <div className="container mx-auto px-4"><BuilderCta /></div>
  </>;
}
