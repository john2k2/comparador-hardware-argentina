import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import { SITE_URL } from '@/lib/site-config';
import { formatPriceARS } from '@/lib/price-utils';
import { GUIDE_CATALOG_CATEGORIES, resolveGuideSlots, type ResolvedGuideComponent } from '@/lib/seo/budget-guide-pricing';
import { getBudgetGuideBySlug } from '@/lib/seo/budget-guides-data';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';
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
  const guide = getBudgetGuideBySlug(slug);
  
  if (!guide) {
    return {
      title: 'Guía no encontrada',
    };
  }

  return {
    title: guide.metadataTitle ? { absolute: guide.metadataTitle } : guide.title,
    description: guide.description,
    keywords: guide.keywords,
    alternates: {
      canonical: `${SITE_URL}/guia/${slug}`,
    },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/guia/${slug}`,
      title: guide.title,
      description: guide.description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export const revalidate = 300;
export const dynamic = 'force-dynamic';

export default async function BudgetGuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getBudgetGuideBySlug(slug);
  
  if (!guide) {
    notFound();
  }

  const catalogProducts = (
    await Promise.all(
      GUIDE_CATALOG_CATEGORIES.map((category) =>
        readProductsFromDatabase({ limit: 400, category }).catch(() => []),
      ),
    )
  ).flat();
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;
  const resolved = resolveGuideSlots(guide.components, catalogProducts);
  const slots = [
    { label: 'PROCESADOR', item: resolved.cpu },
    { label: 'PLACA DE VIDEO', item: resolved.gpu },
    { label: 'MEMORIA RAM', item: resolved.ram },
    { label: 'ALMACENAMIENTO', item: resolved.ssd },
    { label: 'MOTHERBOARD', item: resolved.motherboard },
    { label: 'FUENTE', item: resolved.psu },
    { label: 'GABINETE', item: resolved.case },
  ];

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
          {guide.description} Solo usamos ofertas del catálogo con stock confirmado.
        </p>
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
              {resolved.inStockSlots} de {slots.length} {slots.length === 1 ? 'parte comprable' : 'partes comprables'}
            </p>
          </div>
          
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">RENDIMIENTO</div>
            <div className="text-[12px] md:text-[16px] font-mono normal-case tracking-normal text-primary break-words">{guide.performance}</div>
          </div>
        </div>
        {resolved.hasEstimates && (
          <p className="mt-4 text-[10px] md:text-[11px] uppercase text-muted-foreground font-mono leading-relaxed">
            {slots.length - resolved.inStockSlots === 1
              ? 'Falta 1 parte sin oferta en stock.'
              : `Faltan ${slots.length - resolved.inStockSlots} partes sin oferta en stock.`}
            Esas filas no entran al total comprable y muestran un estimado de referencia.
          </p>
        )}
      </section>

      {/* Components */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ CONFIGURACION RECOMENDADA ]
        </h2>
        
        <div className="space-y-4">
          {slots.map((slot) => (
            <ComponentRow key={slot.label} label={slot.label} item={slot.item} />
          ))}
        </div>
        <p className="mt-4 text-[10px] uppercase text-muted-foreground font-mono leading-relaxed">
          Cada precio de catálogo sale de una tienda con stock. Los avisos sin stock no se recomiendan.
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
            <div className="space-y-2">
              {guide.gamesPerformance.map((game, i) => (
                <div key={i} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] font-mono">
                  <span className="min-w-0 break-words">{game.game}</span>
                  <span className="shrink-0">{game.fps} FPS ({game.settings})</span>
                </div>
              ))}
            </div>
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

      {guide.faqs.length > 0 && (
        <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
          <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
            [ PREGUNTAS FRECUENTES ]
          </h2>
          <div className="space-y-4">
            {guide.faqs.map((faq) => (
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
            '@type': 'FAQPage',
            mainEntity: guide.faqs.map(faq => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />
    </div>
  );
}

function ComponentRow({
  label,
  item,
}: {
  label: string;
  item: ResolvedGuideComponent;
}) {
  const extraOffers = item.offers.slice(1, 3);
  const isCatalog = item.priceSource === 'catalog';

  return (
    <div className={`border-2 p-4 flex flex-col md:flex-row md:items-center gap-4 ${isCatalog ? 'border-border' : 'border-dashed border-muted'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-[10px] text-muted-foreground">{label}</span>
          <span className={`text-[8px] uppercase font-bold px-2 py-1 border-2 ${isCatalog ? 'border-secondary text-secondary' : 'border-muted text-muted-foreground'}`}>
            {isCatalog ? (item.offers[0]?.stock === 'low-stock' ? 'STOCK BAJO' : 'EN STOCK') : 'SIN STOCK'}
          </span>
        </div>
        <h3 className="text-[12px] font-bold break-words">{item.name}</h3>
        <p className="text-[10px] text-muted-foreground mt-1">{item.description}</p>
        {isCatalog && item.bestStoreName && (
          <p className="text-[10px] uppercase text-accent font-bold mt-2 break-words">
            {`Mejor precio: @${item.bestStoreName}`}
          </p>
        )}
        {extraOffers.length > 0 && (
          <p className="text-[10px] uppercase text-muted-foreground mt-1 break-words">
            {extraOffers.map((offer) => `@${offer.storeName} ${formatPriceARS(offer.price)}`).join(' · ')}
          </p>
        )}
      </div>
      <div className="text-left md:text-right shrink-0 min-w-0">
        <div className="text-[14px] sm:text-[16px] font-pixel text-primary break-words">{formatPriceARS(item.price)}</div>
        {isCatalog ? (
          <div className="text-[10px] text-muted-foreground">
            {item.storeCount === 1 ? '1 tienda con stock' : `${item.storeCount} tiendas con stock`}
          </div>
        ) : (
          <div className="text-[10px] uppercase text-muted-foreground">Estimado. No recomendar compra.</div>
        )}
        <div className="flex flex-col md:items-end gap-1 mt-1">
          {item.bestStoreUrl && (
            <a
              href={item.bestStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-[10px] text-secondary hover:underline"
            >
              Ver en tienda →
            </a>
          )}
          {item.productId && (
            <Link
              href={`/product/${item.productId}`}
              className="inline-flex min-h-11 items-center text-[10px] text-primary hover:underline"
            >
              Comparar tiendas →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
