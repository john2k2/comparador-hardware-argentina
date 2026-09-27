import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import { formatPriceARS } from '@/lib/price-utils';
import { resolveComparisonPricing } from '@/lib/seo/comparison-pricing';
import { resolveComparisonPageMetadata } from '@/lib/seo/landing-metadata';
import { 
  getComparisonBySlug, 
  findProductInComparison,
  type ComparisonDefinition 
} from '@/lib/seo/comparisons-data';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';
import { ComparisonBenchSources } from '@/components/seo/ComparisonBenchSources';
import { BuilderCta } from '@/components/seo/BuilderCta';
import { EditorialUpdatedStamp } from '@/components/seo/EditorialUpdatedStamp';
import Link from 'next/link';
import type { HardwareCategory, Product } from '@/lib/types';
import { getCategoryLabel } from '@/lib/search/search-seo';
import { buildCategoryLandingPath } from '@/lib/seo/category-landing-routes';
import { DEFAULT_OG_IMAGE } from '@/lib/seo/metadata';
import { getEditorialMethodology } from '@/lib/seo/editorial-methodology';
import { EditorialMethodology } from '@/components/seo/EditorialMethodology';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const { getAllComparisonSlugs } = await import('@/lib/seo/comparisons-data');
  return getAllComparisonSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return resolveComparisonPageMetadata(slug);
}

export const dynamic = 'force-dynamic';

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);
  
  if (!comparison) {
    notFound();
  }

  // Filtrar por modelo en la base: no transformar mil filas dentro del Worker
  // para encontrar solo dos productos. Los aliases se contrastan después.
  const definitions = [comparison.product1, comparison.product2];
  const allProducts = (
    await Promise.all(
      definitions.map((definition) =>
        readProductsFromDatabase({ limit: 32, category: definition.category, query: definition.searchTerms[0] }).catch(() => []),
      ),
    )
  ).flat();
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;

  const { product1, product2 } = findProductInComparison(comparison, allProducts);
  const pricing = resolveComparisonPricing({
    product1Name: comparison.product1.name,
    product2Name: comparison.product2.name,
    product1Prices: product1?.prices,
    product2Prices: product2?.prices,
  });
  const p1Prices = pricing.side1.prices;
  const p2Prices = pricing.side2.prices;
  const p1BestPrice = pricing.side1.bestPrice ?? 0;
  const p2BestPrice = pricing.side2.bestPrice ?? 0;
  const methodology = getEditorialMethodology(slug);
  const editorialDate = methodology?.updatedAt ?? EDITORIAL_UPDATED_AT;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-[10px] md:text-[11px] text-muted-foreground mb-6 font-mono flex flex-wrap gap-x-1 break-words">
        <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/comparativa" className="hover:text-primary transition-colors">Comparativas</Link>
        <span className="mx-2">/</span>
        <Link
          href={buildCategoryLandingPath(comparison.product1.category)}
          className="hover:text-primary transition-colors"
        >
          {comparison.product1.category === 'procesadores' ? 'Comparar procesadores' : (getCategoryLabel(comparison.product1.category as HardwareCategory) ?? comparison.product1.category)}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{comparison.product1.name} vs {comparison.product2.name}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <h1 className="font-mono! text-base md:text-[20px] md:font-pixel! text-primary mb-3 leading-snug tracking-normal break-words max-w-full">
          {comparison.product1.name} vs {comparison.product2.name}
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          {comparison.description}
        </p>
        <div className="mt-3">
          <EditorialUpdatedStamp isoDate={editorialDate} />
        </div>
      </header>

      {/* Introducción */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ INTRODUCCION ]
        </h2>
        <div className="space-y-3 text-[11px] md:text-[12px] leading-relaxed normal-case text-foreground/85 font-mono">
          <p>
            <strong>{comparison.product1.name}</strong> prioriza {comparison.product1.pros[0].toLowerCase()}, mientras que{' '}
            <strong>{comparison.product2.name}</strong> se destaca por {comparison.product2.pros[0].toLowerCase()}.
            La mejor elección depende del uso, la compatibilidad y las ofertas comparables disponibles hoy.
          </p>
          <p>
            {pricing.storeCoverageCopy} El rendimiento, el consumo y las temperaturas los tomamos de
            reviews de TechPowerUp (resumen, no copia). Acá el dato propio es el precio en tiendas
            argentinas que informaron stock al observar la publicación.
          </p>
          <p>
            Compará la variante exacta, VRAM o socket, consumo, garantía y condiciones de envío. Si no hay una oferta
            comparable observada recientemente, no mostramos un ganador de precio. Confirmá ambos valores en las tiendas antes de decidir.
          </p>
        </div>
      </section>

      {/* Quick Comparison */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ RESUMEN RAPIDO ]
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Product 1 */}
          <ProductCard 
            product={comparison.product1}
            realProduct={product1}
            prices={p1Prices}
            bestPrice={p1BestPrice}
          />

          {/* Product 2 */}
          <ProductCard 
            product={comparison.product2}
            realProduct={product2}
            prices={p2Prices}
            bestPrice={p2BestPrice}
          />
        </div>

        {pricing.canDeclareWinner && pricing.cheaperName && pricing.priceDiff != null && (
          <div className="mt-4 p-3 bg-primary/10 border-2 border-primary text-[11px] font-mono">
            Según las últimas observaciones, <strong>{pricing.cheaperName}</strong> figuró ${formatPriceARS(pricing.priceDiff).replace('$', '')} más barato. La diferencia puede haber cambiado.
          </div>
        )}
      </section>

      {/* Specs Comparison */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ ESPECIFICACIONES ]
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border-2 border-border p-4">
            <h3 className="text-[12px] font-bold text-primary mb-3">{comparison.product1.name}</h3>
            <p className="text-[11px] font-mono mb-3">{comparison.product1.specs}</p>
            
            <div className="mb-3">
              <div className="text-[10px] text-green-600 font-bold mb-1">✓ VENTAJAS</div>
              <ul className="text-[10px] font-mono space-y-1">
                {comparison.product1.pros.map((pro, i) => (
                  <li key={i}>• {pro}</li>
                ))}
              </ul>
            </div>
            
            <div>
              <div className="text-[10px] text-red-600 font-bold mb-1">✗ DESVENTAJAS</div>
              <ul className="text-[10px] font-mono space-y-1">
                {comparison.product1.cons.map((con, i) => (
                  <li key={i}>• {con}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-2 border-border p-4">
            <h3 className="text-[12px] font-bold text-primary mb-3">{comparison.product2.name}</h3>
            <p className="text-[11px] font-mono mb-3">{comparison.product2.specs}</p>
            
            <div className="mb-3">
              <div className="text-[10px] text-green-600 font-bold mb-1">✓ VENTAJAS</div>
              <ul className="text-[10px] font-mono space-y-1">
                {comparison.product2.pros.map((pro, i) => (
                  <li key={i}>• {pro}</li>
                ))}
              </ul>
            </div>
            
            <div>
              <div className="text-[10px] text-red-600 font-bold mb-1">✗ DESVENTAJAS</div>
              <ul className="text-[10px] font-mono space-y-1">
                {comparison.product2.cons.map((con, i) => (
                  <li key={i}>• {con}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Price Table */}
      {(p1Prices.length > 0 || p2Prices.length > 0) && (
        <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
          <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
            [ COMPARATIVA DE PRECIOS POR TIENDA ]
          </h2>
          <p className="mb-4 text-[10px] md:text-[11px] font-mono text-muted-foreground">Precios observados en las últimas 3 horas, no garantizados. Abrí cada publicación para comprobar precio, stock y variante antes de comprar.</p>
          
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] md:text-[11px] font-mono">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left py-2 px-3">Tienda</th>
                  <th className="text-right py-2 px-3">{comparison.product1.name}</th>
                  <th className="text-right py-2 px-3">{comparison.product2.name}</th>
                  <th className="text-right py-2 px-3">Diferencia observada</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set([...p1Prices, ...p2Prices].map(p => p.storeId))).map(storeId => {
                  const p1Offer = p1Prices.find(p => p.storeId === storeId);
                  const p2Offer = p2Prices.find(p => p.storeId === storeId);
                  const p1Price = p1Offer?.price ?? 0;
                  const p2Price = p2Offer?.price ?? 0;
                  const store = p1Offer?.storeName || p2Offer?.storeName || storeId;
                  const diff = p1Price && p2Price ? p1Price - p2Price : 0;
                  
                  return (
                    <tr key={storeId} className="border-b border-border/50">
                      <td className="py-2 px-3">{store}</td>
                      <td className="text-right py-2 px-3">
                        {p1Offer ? <ObservedStorePrice offer={p1Offer} store={store} /> : '-'}
                      </td>
                      <td className="text-right py-2 px-3">
                        {p2Offer ? <ObservedStorePrice offer={p2Offer} store={store} /> : '-'}
                      </td>
                      <td className={`text-right py-2 px-3 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>
                        {diff !== 0 ? formatPriceARS(Math.abs(diff)) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ComparisonBenchSources sources={comparison.sources} />
      {methodology && <EditorialMethodology content={methodology} />}
      <BuilderCta />

      {/* Conclusion */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ CONCLUSION ]
        </h2>
        
        <p className="text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono">
          {comparison.conclusion}
        </p>
      </section>

      {comparison.faqs.length > 0 && (
        <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
          <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
            [ PREGUNTAS FRECUENTES ]
          </h2>
          <div className="space-y-4">
            {comparison.faqs.map((faq) => (
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
          <p className="mt-5">
            <Link
              href={buildCategoryLandingPath(comparison.product1.category)}
              className="text-[10px] md:text-[11px] font-bold uppercase text-primary hover:underline"
            >
              {comparison.product1.category === 'procesadores' ? 'Comparar procesadores →' : 'Ver precios de la categoría →'}
            </Link>
          </p>
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
                headline: comparison.title,
                description: comparison.description,
                url: `${SITE_URL}/comparativa/${comparison.slug}`,
                inLanguage: 'es-AR',
                dateModified: `${editorialDate}T00:00:00.000Z`,
                author: { '@type': 'Organization', '@id': `${SITE_URL}#organization`, name: SITE_NAME },
                publisher: { '@id': `${SITE_URL}#organization` },
                image: DEFAULT_OG_IMAGE,
              },
              {
                '@type': 'FAQPage',
                mainEntity: comparison.faqs.map(faq => ({
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

function ProductCard({ 
  product, 
  realProduct, 
  prices, 
  bestPrice 
}: { 
  product: ComparisonDefinition['product1'];
  realProduct?: Product;
  prices: Product['prices'];
  bestPrice: number;
}) {
  const bestOffer = prices[0];
  const bestStoreUrl = bestOffer ? safeStoreUrl(bestOffer.url) : null;
  return (
    <div className="border-2 border-border p-4">
      <h3 className="text-[12px] font-bold text-foreground mb-2">{product.name}</h3>
      <div className="text-[10px] text-muted-foreground mb-2 font-mono">{product.specs}</div>
      <div className="text-[16px] sm:text-[24px] md:text-[28px] font-pixel text-primary mb-1 break-words">
        {bestPrice > 0 ? formatPriceARS(bestPrice) : 'Sin precio reciente'}
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        {prices.length === 0
          ? 'Sin observaciones recientes de precio y stock'
          : prices.length === 1
            ? '1 tienda informó stock en las últimas 3 h'
            : `${prices.length} tiendas informaron stock en las últimas 3 h`}
      </p>
      {bestOffer && <p className="mt-1 text-[10px] text-muted-foreground font-mono">Menor precio observado en {bestOffer.storeName || bestOffer.storeId} el {formatObservationDate(bestOffer.lastUpdated)}. Puede haber cambiado.</p>}
      {bestStoreUrl && <a href={bestStoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[10px] text-secondary hover:underline">Comprobar en tienda →</a>}
      {realProduct && (
        <Link 
          href={`/product/${realProduct.id}`}
          className="inline-flex min-h-11 items-center mt-3 text-[10px] bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 transition-colors"
        >
          VER DETALLES →
        </Link>
      )}
    </div>
  );
}

function formatObservationDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value)) + ' (Argentina)';
}

function safeStoreUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function ObservedStorePrice({ offer, store }: { offer: Product['prices'][number]; store: string }) {
  const url = safeStoreUrl(offer.url);
  return (
    <div>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline" aria-label={`Comprobar precio de ${store} en la tienda`}>{formatPriceARS(offer.price)} ↗</a> : formatPriceARS(offer.price)}
      <span className="block text-[9px] text-muted-foreground">Obs. {formatObservationDate(offer.lastUpdated)}</span>
    </div>
  );
}
