import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { loadGuideCatalogProducts } from '@/lib/seo/guide-catalog';
import { formatPriceARS } from '@/lib/price-utils';
import { GUIDE_SLOT_KEYS, resolveLiveGuideSlots } from '@/lib/seo/budget-builder';
import { getBudgetGuideBySlug } from '@/lib/seo/budget-guides-data';
import { resolveGuideFaqs, canPublishGuideFps } from '@/lib/seo/guide-faqs';
import { resolveGuidePageMetadata } from '@/lib/seo/landing-metadata';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';
import { SITE_URL } from '@/lib/site-config';
import { EditorialUpdatedStamp } from '@/components/seo/EditorialUpdatedStamp';
import { GuideFpsPanel } from '@/components/seo/GuideFpsPanel';
import { GuideComponentRows } from '@/components/seo/GuideComponentRows';
import Link from 'next/link';

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

export const revalidate = 300;
export const dynamic = 'force-dynamic';

export default async function BudgetGuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getBudgetGuideBySlug(slug);
  
  if (!guide) {
    notFound();
  }

  const catalogProducts = await loadGuideCatalogProducts();
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;
  const resolved = resolveLiveGuideSlots(guide, catalogProducts);
  const faqs = resolveGuideFaqs(guide.faqs, resolved.cpu, resolved.gpu);
  const slotCount = GUIDE_SLOT_KEYS.length;

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
          {guide.description} Las piezas salen de ofertas en stock: mismo socket y generación de RAM, y una fuente que cubra el consumo estimado del combo.
        </p>
        <div className="mt-3">
          <EditorialUpdatedStamp isoDate={EDITORIAL_UPDATED_AT} />
        </div>
      </header>

      {/* Price Summary */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ PRESUPUESTO Y STOCK ]
        </h2>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">PRESUPUESTO</div>
            <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">{formatPriceARS(guide.budget)}</div>
          </div>
          
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">TOTAL CON STOCK</div>
            <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">{formatPriceARS(resolved.catalogTotal)}</div>
            <p className="mt-2 text-[10px] uppercase text-muted-foreground">
              {resolved.inStockSlots} de {slotCount} {slotCount === 1 ? 'parte comprable' : 'partes comprables'}
            </p>
          </div>
          
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">RENDIMIENTO</div>
            <div className="text-[12px] md:text-[16px] font-mono normal-case tracking-normal text-primary break-words">{guide.performance}</div>
          </div>
        </div>
        {resolved.hasEstimates && (
          <p className="mt-4 text-[10px] md:text-[11px] uppercase text-muted-foreground font-mono leading-relaxed">
            {slotCount - resolved.inStockSlots === 1
              ? 'Falta 1 parte sin oferta en stock.'
              : `Faltan ${slotCount - resolved.inStockSlots} partes sin oferta en stock.`}
            Esas filas no entran al total comprable y muestran un estimado de referencia.
          </p>
        )}
      </section>

      {/* Components */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ CONFIGURACION RECOMENDADA ]
        </h2>
        
        <GuideComponentRows slots={resolved} />
        <p className="mt-4 text-[10px] uppercase text-muted-foreground font-mono leading-relaxed">
          Cada precio de catálogo sale de una tienda con stock. CPU, mother y RAM tienen que coincidir en socket y generación.
        </p>
      </section>

      {/* Performance */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ RENDIMIENTO ESPERADO ]
        </h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4">
            <h3 className="text-[11px] font-bold mb-3">Gaming</h3>
            <GuideFpsPanel
              canPublish={canPublishGuideFps(resolved.cpu, resolved.gpu, {
                cpuTerms: guide.components.cpu.searchTerms,
                gpuTerms: guide.components.gpu.searchTerms,
              })}
              games={guide.gamesPerformance}
            />
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
                '@type': 'WebPage',
                url: `${SITE_URL}/guia/${slug}`,
                dateModified: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
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
