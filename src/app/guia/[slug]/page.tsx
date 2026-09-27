import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { loadGuideCatalogProducts, loadGuidePriorityProducts } from '@/lib/seo/guide-catalog';
import { formatPriceARS } from '@/lib/price-utils';
import { GUIDE_SLOT_KEYS, resolveLiveGuideSlots } from '@/lib/seo/budget-builder';
import { getBudgetGuideBySlug } from '@/lib/seo/budget-guides-data';
import { resolveGuideFaqs } from '@/lib/seo/guide-faqs';
import { resolveGuidePageMetadata } from '@/lib/seo/landing-metadata';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';
import { EditorialUpdatedStamp } from '@/components/seo/EditorialUpdatedStamp';
import { GuideFpsPanel } from '@/components/seo/GuideFpsPanel';
import { GuideComponentRows } from '@/components/seo/GuideComponentRows';
import { GuideRefreshPanel } from '@/components/seo/GuideRefreshPanel';
import { resolveGuideReferenceOffer } from '@/lib/seo/budget-guide-pricing';
import type { RefreshTarget } from '@/lib/catalog/on-demand/contracts';
import { AdvisoryCta } from '@/components/commercial/AdvisoryCta';
import { BuilderCta } from '@/components/seo/BuilderCta';
import Link from 'next/link';
import { DEFAULT_OG_IMAGE } from '@/lib/seo/metadata';
import { getEditorialMethodology } from '@/lib/seo/editorial-methodology';
import { EditorialMethodology } from '@/components/seo/EditorialMethodology';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const { getAllBudgetGuideSlugs } = await import('@/lib/seo/budget-guides-data');
  return getAllBudgetGuideSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return resolveGuidePageMetadata(slug);
}

export const dynamic = 'force-dynamic';

export default async function BudgetGuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getBudgetGuideBySlug(slug);
  
  if (!guide) {
    notFound();
  }

  let catalogProducts = await loadGuideCatalogProducts();
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;
  let resolved = resolveLiveGuideSlots(guide, catalogProducts);
  if (resolved.gpu.priceSource !== 'catalog' && !resolveGuideReferenceOffer(guide.components.gpu, catalogProducts)) {
    const priorityProducts = await loadGuidePriorityProducts(guide.components.gpu.category, guide.components.gpu.searchTerms);
    catalogProducts = [...new Map([...catalogProducts, ...priorityProducts].map((product) => [product.id, product])).values()];
    resolved = resolveLiveGuideSlots(guide, catalogProducts);
  }
  const references = Object.fromEntries(GUIDE_SLOT_KEYS.map((key) => [
    key,
    resolved[key].priceSource === 'catalog' ? null : resolveGuideReferenceOffer(guide.components[key], catalogProducts),
  ])) as Record<(typeof GUIDE_SLOT_KEYS)[number], ReturnType<typeof resolveGuideReferenceOffer>>;
  const refreshTargets = GUIDE_SLOT_KEYS.flatMap((key): RefreshTarget[] => {
    const current = resolved[key];
    const offer = current.offers[0];
    if (current.productId && offer) return [{ productId: current.productId, storeId: offer.storeId, url: offer.url }];
    const reference = references[key];
    return reference ? [{ productId: reference.productId, storeId: reference.storeId, url: reference.url }] : [];
  });
  const faqs = resolveGuideFaqs(guide.faqs, resolved.cpu, resolved.gpu);
  const slotCount = GUIDE_SLOT_KEYS.length;
  const methodology = getEditorialMethodology(slug);
  const editorialDate = methodology?.updatedAt ?? EDITORIAL_UPDATED_AT;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-[10px] md:text-[11px] text-muted-foreground mb-6 font-mono flex flex-wrap gap-x-1 break-words">
        <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/guia" className="hover:text-primary transition-colors">Guías</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">PC Gamer ${(guide.budget / 1000000).toFixed(0)}M</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <h1 className="font-mono! text-base md:text-[20px] md:font-pixel! text-primary mb-3 leading-snug tracking-normal break-words max-w-full">
          PC Gamer por {formatPriceARS(guide.budget)}
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          {guide.description} Las piezas salen del catálogo con disponibilidad informada por las tiendas. Revisá las fechas, los envíos y las comprobaciones pendientes antes de comprar.
        </p>
        <div className="mt-3">
          <EditorialUpdatedStamp isoDate={editorialDate} />
        </div>
      </header>

      {/* Price Summary */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ PRESUPUESTO Y STOCK ]
        </h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">PRESUPUESTO OBJETIVO</div>
            <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">{formatPriceARS(guide.budget)}</div>
          </div>
          
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">{resolved.hasEstimates ? 'SUBTOTAL OBSERVADO — ARMADO INCOMPLETO' : 'TOTAL OBSERVADO — NO GARANTIZADO'}</div>
            <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">{resolved.inStockSlots > 0 ? formatPriceARS(resolved.catalogTotal) : 'Sin precios recientes'}</div>
            <p className="mt-2 text-[10px] uppercase text-muted-foreground">
              {resolved.inStockSlots} de {slotCount} partes con oferta observada en las últimas 3 h
            </p>
          </div>
          
        </div>
        {resolved.hasEstimates && (
          <p className="mt-4 text-[10px] md:text-[11px] uppercase text-muted-foreground font-mono leading-relaxed">
            {slotCount - resolved.inStockSlots === 1
              ? 'Falta 1 parte sin oferta reciente.'
              : `Faltan ${slotCount - resolved.inStockSlots} partes sin oferta reciente.`}
            {' '}No hay un precio comprobable para el armado completo; esas filas no entran al subtotal.
          </p>
        )}
      </section>

      {process.env.ENABLE_ON_DEMAND_REFRESH === '1' && <GuideRefreshPanel targets={refreshTargets} />}

      {/* Components */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ SELECCION TECNICA ORIENTATIVA ]
        </h2>
        
        <GuideComponentRows slots={resolved} references={references} />
        <p className="mt-4 text-[10px] uppercase text-muted-foreground font-mono leading-relaxed">
          Cada precio es una observación de las últimas 3 horas, no una cotización en tiempo real. Si una pieza no tiene oferta reciente, no le asignamos precio. Confirmá stock y precio final en la tienda; CPU, mother y RAM deben coincidir en socket y generación.
        </p>
      </section>

      <BuilderCta budget={guide.budget} />
      {methodology && <EditorialMethodology content={methodology} />}

      <div className="mb-8">
        <AdvisoryCta surface="budget_guide" />
      </div>

      {/* Performance */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ RENDIMIENTO ESPERADO ]
        </h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4">
            <h3 className="text-[11px] font-bold mb-3">Gaming</h3>
            <GuideFpsPanel />
          </div>
          
          <div className="border-2 border-border p-4">
            <h3 className="text-[11px] font-bold mb-3">Productividad</h3>
            <div className="space-y-2">
              {guide.productivity.map((task, i) => (
                <div key={i} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] font-mono">
                  <span className="min-w-0 break-words">{task.task}</span>
                  <span className="shrink-0">{task.performance}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tips */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ CONSEJOS DE COMPRA ]
        </h2>
        
        <div className="space-y-3">
          {guide.tips.map((tip, i) => (
            <p key={i} className="text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono">
              <strong>{i + 1}. {tip.split(':')[0]}:</strong>
              {tip.split(':').slice(1).join(':')}
            </p>
          ))}
        </div>
      </section>

      {faqs.length > 0 && (
        <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
          <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
            [ PREGUNTAS FRECUENTES ]
          </h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="text-[11px] md:text-[12px] font-bold normal-case tracking-normal text-foreground font-mono">
                  {faq.question}
                </h3>
                <p className="mt-1 text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: guide.title,
                description: guide.description,
                url: `${SITE_URL}/guia/${slug}`,
                inLanguage: 'es-AR',
                dateModified: `${editorialDate}T00:00:00.000Z`,
                author: { '@type': 'Organization', '@id': `${SITE_URL}#organization`, name: SITE_NAME },
                publisher: { '@id': `${SITE_URL}#organization` },
                image: DEFAULT_OG_IMAGE,
              },
              {
                '@type': 'FAQPage',
                mainEntity: faqs.map(faq => ({
                  '@type': 'Question',
                  name: faq.question,
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: faq.answer,
                  },
                })),
              },
            ],
          }),
        }}
      />
    </div>
  );
}
