import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { loadGuideCatalogSnapshot } from '@/lib/seo/guide-catalog';
import { formatPriceARS } from '@/lib/price-utils';
import { GUIDE_SLOT_KEYS, GUIDE_SLOT_LABELS, publishedGuideBudgetLimit, resolveLiveGuideSlots } from '@/lib/seo/budget-builder';
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
import { resolveGuideRefreshOffers } from '@/lib/seo/budget-guide-pricing';
import { MAX_GUIDE_REFRESH_ROUNDS, type RefreshTarget } from '@/lib/catalog/on-demand/contracts';
import { AdvisoryCta } from '@/components/commercial/AdvisoryCta';
import { BuilderCta } from '@/components/seo/BuilderCta';
import Link from 'next/link';
import { DEFAULT_OG_IMAGE } from '@/lib/seo/metadata';
import { getEditorialMethodology } from '@/lib/seo/editorial-methodology';
import { EditorialMethodology } from '@/components/seo/EditorialMethodology';
import { EditorialAdPreview } from '@/components/adsense/EditorialAdPreview';
import { buildCategoryLandingPath } from '@/lib/seo/category-landing-routes';

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

  const { products: catalogProducts, unavailableSlots } = await loadGuideCatalogSnapshot(guide);
  const hasReadErrors = unavailableSlots.length > 0;
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;
  const resolved = resolveLiveGuideSlots(guide, catalogProducts);
  const refreshGroups = GUIDE_SLOT_KEYS.flatMap((key): RefreshTarget[][] => {
    const current = resolved[key];
    const offer = current.offers[0];
    const candidates = resolveGuideRefreshOffers(guide.components[key], catalogProducts)
      .map(reference => ({ productId: reference.productId, storeId: reference.storeId, url: reference.url }));
    if (current.productId && offer) candidates.unshift({ productId: current.productId, storeId: offer.storeId, url: offer.refreshUrl ?? offer.url });
    const group = [...new Map(candidates.map(target => [JSON.stringify(target), target])).values()].slice(0, MAX_GUIDE_REFRESH_ROUNDS);
    return group.length ? [group] : [];
  });
  const faqs = resolveGuideFaqs(guide.faqs, resolved.cpu, resolved.gpu);
  const slotCount = GUIDE_SLOT_KEYS.length;
  const missingSlots = GUIDE_SLOT_KEYS.filter((key) => {
    const item = resolved[key];
    return item.priceSource !== 'catalog' || item.price <= 0 || item.offers.length === 0;
  });
  const methodology = getEditorialMethodology(slug);
  const editorialDate = methodology?.updatedAt ?? EDITORIAL_UPDATED_AT;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-[12px] md:text-[12px] text-muted-foreground mb-6 font-mono flex flex-wrap gap-x-1 break-words">
        <Link href="/" className="inline-flex min-h-11 items-center hover:text-primary transition-colors">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/guia" className="inline-flex min-h-11 items-center hover:text-primary transition-colors">Guías</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">PC Gamer de ${(guide.budget / 1000000).toFixed(0)}M</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <h1 className="font-mono! text-base md:text-[20px] md:font-pixel! text-primary mb-3 leading-snug tracking-normal break-words max-w-full">
          PC Gamer de {formatPriceARS(guide.budget)}
        </h1>
        <p className="text-[12px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
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

        {hasReadErrors && (
          <p role="alert" className="mb-4 font-body text-sm leading-relaxed">
            No pudimos consultar todas las ofertas. Conservamos los precios que pudimos leer con su fecha original;
            que falte una pieza en esta lista no significa que esté agotada.{' '}
            <a href={`/guia/${slug}`} className="underline underline-offset-4">Volver a consultar</a>.
          </p>
        )}
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[12px] text-muted-foreground mb-1">PRESUPUESTO DE REFERENCIA</div>
            <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">{formatPriceARS(guide.budget)}</div>
            <p className="mt-2 text-[12px] text-muted-foreground">Margen de precios: hasta {formatPriceARS(publishedGuideBudgetLimit(guide.budget))} (+10%). Revisamos la selección una vez por semana o a pedido.</p>
          </div>
          
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[12px] text-muted-foreground mb-1">{!resolved.fitsBudget ? 'BUSCANDO UNA SELECCIÓN DENTRO DEL MÁXIMO' : resolved.hasEstimates ? 'SUBTOTAL OBSERVADO — ARMADO INCOMPLETO' : 'TOTAL OBSERVADO — NO GARANTIZADO'}</div>
            <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">{resolved.fitsBudget && resolved.inStockSlots > 0 ? formatPriceARS(resolved.catalogTotal) : 'En preparación'}</div>
            <p className="mt-2 text-[12px] uppercase text-muted-foreground">
              {resolved.fitsBudget ? `${resolved.inStockSlots} de ${slotCount} partes con oferta observada en las últimas 3 h` : 'Las ofertas de la selección actual exceden el límite.'}
            </p>
          </div>
          
        </div>
        {resolved.hasEstimates && resolved.fitsBudget && !hasReadErrors && (
          <p className="mt-4 text-[12px] md:text-[12px] uppercase text-muted-foreground font-mono leading-relaxed">
            {slotCount - resolved.inStockSlots === 1
              ? 'Estamos buscando una oferta disponible para la pieza que falta.'
              : `Estamos buscando ofertas disponibles para las ${slotCount - resolved.inStockSlots} piezas que faltan.`}
            {' '}La lista muestra solo piezas con precio y stock comprobados; el subtotal todavía no alcanza para comprar una PC completa.
          </p>
        )}
        {!resolved.fitsBudget && (
          <p className="mt-4 text-[12px] md:text-[12px] uppercase text-accent font-mono leading-relaxed">
            Las ofertas superan el presupuesto de referencia más el margen del 10%. Revisaremos alternativas compatibles; también podés pedir una revisión de la selección.
          </p>
        )}
      </section>

      {process.env.ENABLE_ON_DEMAND_REFRESH === '1' && <GuideRefreshPanel groups={refreshGroups} />}

      {missingSlots.length > 0 && (
        <section aria-labelledby="guide-missing-title" className="mb-8 border-4 border-border bg-card p-5 md:p-6 pixel-shadow">
          <h2 id="guide-missing-title" className="font-mono! text-base font-bold text-primary">
            Qué falta para completar esta PC
          </h2>
          <p className="mt-3 max-w-prose font-body text-sm leading-relaxed">
            {missingSlots.length === 1 ? 'Esta pieza todavía no tiene una oferta válida para la guía.' : 'Estas piezas todavía no tienen una oferta válida para la guía.'}
            {' '}Podés buscar el modelo elegido o explorar otras opciones. Si cambiás una pieza, revisá la compatibilidad y el total del armado.
          </p>
          <ul className="mt-2 divide-y-2 divide-border">
            {missingSlots.map((key) => {
              const spec = guide.components[key];
              return (
                <li key={key} className="grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <h3 className="font-body text-sm font-bold">{GUIDE_SLOT_LABELS[key]}</h3>
                    <p className="mt-1 break-words font-body text-sm">{spec.name}</p>
                    <p className="mt-1 font-body text-sm text-muted-foreground">
                      {unavailableSlots.includes(key)
                        ? 'No pudimos consultar esta pieza. Volvé a consultar la guía o buscá el modelo.'
                        : 'Sin oferta observada que cumpla los controles de la guía en las últimas 3 horas. Esto no confirma agotamiento.'}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-3 md:flex-col md:items-start">
                    <Link
                      href={{ pathname: '/search', query: { q: spec.exactPartNumber || spec.searchTerms[0] || spec.name, category: spec.category } }}
                      prefetch={false}
                      aria-label={`Buscar este modelo: ${spec.name}`}
                      className="inline-flex min-h-11 items-center border-2 border-secondary px-3 py-2 font-body text-sm font-bold text-secondary hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                    >
                      Buscar este modelo
                    </Link>
                    <Link
                      href={buildCategoryLandingPath(spec.category)}
                      prefetch={false}
                      aria-label={`Ver alternativas de ${GUIDE_SLOT_LABELS[key].toLowerCase()}`}
                      className="inline-flex min-h-11 items-center font-body text-sm text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                    >
                      Ver alternativas
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Components */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ PIEZAS DISPONIBLES EN TIENDAS ]
        </h2>
        
        {resolved.fitsBudget && resolved.inStockSlots > 0 ? (
          <GuideComponentRows slots={resolved} buyableOnly />
        ) : (
          <p className="font-body text-sm leading-relaxed">
            Este presupuesto está en preparación. Mientras buscamos una selección disponible dentro del máximo, podés{' '}
            <Link href={`/guia/armar?pesos=${guide.budget}`} className="text-primary underline underline-offset-4">armar tu propia selección</Link>{' '}
            o pedirnos ayuda para elegir las piezas.
          </p>
        )}
        <p className="mt-4 text-[12px] uppercase text-muted-foreground font-mono leading-relaxed">
          No es necesario gastar todo el presupuesto.{' '}
          Elegimos la oferta válida de menor precio entre las comprobadas en las últimas 3 horas. Si la más barata no tiene stock o no se pudo confirmar, usamos la siguiente disponible. Confirmá el precio final, el envío y la compatibilidad antes de comprar.
        </p>
      </section>

      <BuilderCta budget={guide.budget} />
      {methodology && <EditorialMethodology content={methodology} />}
      <EditorialAdPreview pathname={`/guia/${slug}`} contentReady={!hasReadErrors && Boolean(methodology) && resolved.fitsBudget && resolved.inStockSlots === slotCount} />

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
            <h3 className="text-[12px] font-bold mb-3">Gaming</h3>
            <GuideFpsPanel />
          </div>
          
          <div className="border-2 border-border p-4">
            <h3 className="text-[12px] font-bold mb-3">Productividad</h3>
            <div className="space-y-2">
              {guide.productivity.map((task, i) => (
                <div key={i} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] font-mono">
                  <span className="min-w-0 break-words">{task.task}</span>
                  <span className="min-w-0 max-w-full break-words">{task.performance}</span>
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
            <p key={i} className="text-[12px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono">
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
                <h3 className="text-[12px] md:text-[12px] font-bold normal-case tracking-normal text-foreground font-mono">
                  {faq.question}
                </h3>
                <p className="mt-1 text-[12px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono">
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
