import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import { SITE_URL } from '@/lib/site-config';
import { formatPriceARS } from '@/lib/price-utils';
import { 
  getComparisonBySlug, 
  findProductInComparison,
  type ComparisonDefinition 
} from '@/lib/seo/comparisons-data';
import Link from 'next/link';
import type { Product } from '@/lib/types';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const { getAllComparisonSlugs } = await import('@/lib/seo/comparisons-data');
  return getAllComparisonSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);
  
  if (!comparison) {
    return {
      title: 'Comparativa no encontrada',
    };
  }

  return {
    title: comparison.title,
    description: comparison.description,
    keywords: comparison.keywords,
    alternates: {
      canonical: `${SITE_URL}/comparativa/${slug}`,
    },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/comparativa/${slug}`,
      title: comparison.title,
      description: comparison.description,
      images: [`${SITE_URL}/og-image.svg`],
    },
  };
}

export const revalidate = 300;

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);
  
  if (!comparison) {
    notFound();
  }

  const allProducts = await readProductsFromDatabase({ limit: 2000 });
  const { product1, product2 } = findProductInComparison(comparison, allProducts);

  const p1Prices = product1?.prices.filter(p => p.price > 0).sort((a, b) => a.price - b.price) || [];
  const p2Prices = product2?.prices.filter(p => p.price > 0).sort((a, b) => a.price - b.price) || [];

  const p1BestPrice = p1Prices[0]?.price || 0;
  const p2BestPrice = p2Prices[0]?.price || 0;
  
  const cheaperProduct = p1BestPrice < p2BestPrice ? comparison.product1.name : comparison.product2.name;
  const priceDiff = Math.abs(p1BestPrice - p2BestPrice);

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-[10px] md:text-[11px] text-muted-foreground mb-6 font-mono">
        <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/comparativa" className="hover:text-primary transition-colors">Comparativas</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{comparison.product1.name} vs {comparison.product2.name}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <h1 className="text-[16px] md:text-[20px] font-pixel text-primary mb-3 leading-tight">
          {comparison.product1.name} vs {comparison.product2.name}
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          {comparison.description}
        </p>
      </header>

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

        {priceDiff > 0 && (
          <div className="mt-4 p-3 bg-primary/10 border-2 border-primary text-[11px] font-mono">
            <strong>{cheaperProduct}</strong> es ${formatPriceARS(priceDiff).replace('$', '')} más barato
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

      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: comparison.faqs.map(faq => ({
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
    </main>
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
      <div className="text-[24px] md:text-[28px] font-pixel text-primary mb-1">
        {bestPrice > 0 ? formatPriceARS(bestPrice) : 'Consultar'}
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        {prices.length} tiendas comparadas
      </p>
      {realProduct && (
        <Link 
          href={`/product/${realProduct.id}`}
          className="inline-block mt-3 text-[10px] bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 transition-colors"
        >
          VER DETALLES →
        </Link>
      )}
    </div>
  );
}
