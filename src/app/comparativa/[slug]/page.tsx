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
import { SITE_URL } from '@/lib/site-config';
import { EditorialUpdatedStamp } from '@/components/seo/EditorialUpdatedStamp';
import Link from 'next/link';
import type { HardwareCategory, Product } from '@/lib/types';
import { getCategoryLabel } from '@/lib/search/search-seo';

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

export const revalidate = 300;
export const dynamic = 'force-dynamic';

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);
  
  if (!comparison) {
    notFound();
  }

  // Fetch products from both categories (usually the same) with a high limit.
  // Comparison products are often buried deep in the catalog, so we need
  // enough headroom to find them after grouping/filtering.
  const categories = new Set([comparison.product1.category, comparison.product2.category]);
  const allProducts = (
    await Promise.all(
      Array.from(categories).map((category) =>
        readProductsFromDatabase({ limit: 1000, category: category as HardwareCategory }).catch(() => []),
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

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-[10px] md:text-[11px] text-muted-foreground mb-6 font-mono flex flex-wrap gap-x-1 break-words">
        <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/comparativa" className="hover:text-primary transition-colors">Comparativas</Link>
        <span className="mx-2">/</span>
        <Link
          href={`/search?category=${comparison.product1.category}`}
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
          <EditorialUpdatedStamp isoDate={EDITORIAL_UPDATED_AT} />
        </div>
      </header>

      {/* Introducción */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ INTRODUCCION ]
        </h2>
        <div className="space-y-3 text-[11px] md:text-[12px] leading-relaxed normal-case text-foreground/85 font-mono">
          <p>
            Elegir entre <strong>{comparison.product1.name}</strong> y <strong>{comparison.product2.name}</strong> 
            es una de las decisiones más comunes para gamers argentinos en 2026. Ambos componentes compiten 
            en el mismo segmento de mercado pero con enfoques distintos que pueden marcar la diferencia 
            según tu presupuesto y necesidades específicas.
          </p>
          <p>
            {pricing.storeCoverageCopy} El rendimiento, el consumo y las temperaturas dependen de benches
            de terceros: acá el dato propio es el precio en tiendas argentinas con stock.
          </p>
          <p>
            {comparison.product1.name} destaca por {comparison.product1.pros[0].toLowerCase()} y {comparison.product1.pros[1].toLowerCase()}, 
            mientras que {comparison.product2.name} se posiciona con {comparison.product2.pros[0].toLowerCase()} y {comparison.product2.pros[1].toLowerCase()}. 
            La diferencia de precio entre ambos puede llegar a ser significativa en el mercado argentino, 
            por eso es crucial comparar antes de comprar.
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
            <strong>{pricing.cheaperName}</strong> es ${formatPriceARS(pricing.priceDiff).replace('$', '')} más barato
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
          
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] md:text-[11px] font-mono">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left py-2 px-3">Tienda</th>
                  <th className="text-right py-2 px-3">{comparison.product1.name}</th>
                  <th className="text-right py-2 px-3">{comparison.product2.name}</th>
                  <th className="text-right py-2 px-3">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set([...p1Prices, ...p2Prices].map(p => p.storeName || p.storeId))).map(store => {
                  const p1Price = p1Prices.find(p => (p.storeName || p.storeId) === store)?.price || 0;
                  const p2Price = p2Prices.find(p => (p.storeName || p.storeId) === store)?.price || 0;
                  const diff = p1Price && p2Price ? p1Price - p2Price : 0;
                  
                  return (
                    <tr key={store} className="border-b border-border/50">
                      <td className="py-2 px-3">{store}</td>
                      <td className="text-right py-2 px-3">
                        {p1Price > 0 ? formatPriceARS(p1Price) : '-'}
                      </td>
                      <td className="text-right py-2 px-3">
                        {p2Price > 0 ? formatPriceARS(p2Price) : '-'}
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
              href={`/search?category=${comparison.product1.category}`}
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
                '@type': 'WebPage',
                url: `${SITE_URL}/comparativa/${comparison.slug}`,
                dateModified: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
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
  return (
    <div className="border-2 border-border p-4">
      <h3 className="text-[12px] font-bold text-foreground mb-2">{product.name}</h3>
      <div className="text-[10px] text-muted-foreground mb-2 font-mono">{product.specs}</div>
      <div className="text-[16px] sm:text-[24px] md:text-[28px] font-pixel text-primary mb-1 break-words">
        {bestPrice > 0 ? formatPriceARS(bestPrice) : 'Consultar'}
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        {prices.length === 0
          ? 'Sin ofertas en stock'
          : prices.length === 1
            ? '1 tienda con stock'
            : `${prices.length} tiendas con stock`}
      </p>
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
