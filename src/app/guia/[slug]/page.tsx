import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import { SITE_URL } from '@/lib/site-config';
import { formatPriceARS } from '@/lib/price-utils';
import { 
  getBudgetGuideBySlug,
  type BudgetGuideDefinition 
} from '@/lib/seo/budget-guides-data';
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
    title: guide.title,
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
      images: [`${SITE_URL}/og-image.svg`],
    },
  };
}

export const revalidate = 300;

export default async function BudgetGuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getBudgetGuideBySlug(slug);
  
  if (!guide) {
    notFound();
  }

  const allProducts = await readProductsFromDatabase({ limit: 2000 });
  
  // Buscar productos reales
  const findProduct = (searchTerms: string[]) => {
    return allProducts.find(p => 
      searchTerms.some(term => p.name.toLowerCase().includes(term.toLowerCase()))
    );
  };

  const cpu = findProduct(guide.components.cpu.searchTerms);
  const gpu = findProduct(guide.components.gpu.searchTerms);
  const ram = findProduct(guide.components.ram.searchTerms);
  const ssd = findProduct(guide.components.ssd.searchTerms);

  const totalEstimate = 
    (cpu?.lowestPrice || guide.components.cpu.estimatedPrice) +
    (gpu?.lowestPrice || guide.components.gpu.estimatedPrice) +
    (ram?.lowestPrice || guide.components.ram.estimatedPrice) +
    (ssd?.lowestPrice || guide.components.ssd.estimatedPrice) +
    guide.components.motherboard.estimatedPrice +
    guide.components.psu.estimatedPrice +
    guide.components.case.estimatedPrice;

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-[10px] md:text-[11px] text-muted-foreground mb-6 font-mono">
        <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/guia" className="hover:text-primary transition-colors">Guías</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">PC Gamer ${(guide.budget / 1000000).toFixed(0)}M</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <h1 className="text-[16px] md:text-[20px] font-pixel text-primary mb-3 leading-tight">
          PC Gamer por {formatPriceARS(guide.budget)}
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          {guide.description}
        </p>
      </header>

      {/* Price Summary */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ PRESUPUESTO ESTIMADO ]
        </h2>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">PRESUPUESTO</div>
            <div className="text-[20px] md:text-[24px] font-pixel text-primary">{formatPriceARS(guide.budget)}</div>
          </div>
          
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">ESTIMADO TOTAL</div>
            <div className="text-[20px] md:text-[24px] font-pixel text-primary">{formatPriceARS(totalEstimate)}</div>
          </div>
          
          <div className="border-2 border-border p-4 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">RENDIMIENTO</div>
            <div className="text-[16px] md:text-[20px] font-pixel text-primary">{guide.performance}</div>
          </div>
        </div>
      </section>

      {/* Components */}
      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ CONFIGURACION RECOMENDADA ]
        </h2>
        
        <div className="space-y-4">
          <ComponentRow 
            label="PROCESADOR"
            name={cpu?.name || guide.components.cpu.name}
            description={guide.components.cpu.description}
            price={cpu?.lowestPrice || guide.components.cpu.estimatedPrice}
            storeCount={cpu?.prices.length || 0}
            productId={cpu?.id}
          />
          
          <ComponentRow 
            label="PLACA DE VIDEO"
            name={gpu?.name || guide.components.gpu.name}
            description={guide.components.gpu.description}
            price={gpu?.lowestPrice || guide.components.gpu.estimatedPrice}
            storeCount={gpu?.prices.length || 0}
            productId={gpu?.id}
          />
          
          <ComponentRow 
            label="MEMORIA RAM"
            name={ram?.name || guide.components.ram.name}
            description={guide.components.ram.description}
            price={ram?.lowestPrice || guide.components.ram.estimatedPrice}
            storeCount={ram?.prices.length || 0}
            productId={ram?.id}
          />
          
          <ComponentRow 
            label="ALMACENAMIENTO"
            name={ssd?.name || guide.components.ssd.name}
            description={guide.components.ssd.description}
            price={ssd?.lowestPrice || guide.components.ssd.estimatedPrice}
            storeCount={ssd?.prices.length || 0}
            productId={ssd?.id}
          />
          
          <ComponentRow 
            label="MOTHERBOARD"
            name={guide.components.motherboard.name}
            description={guide.components.motherboard.description}
            price={guide.components.motherboard.estimatedPrice}
            storeCount={0}
          />
          
          <ComponentRow 
            label="FUENTE"
            name={guide.components.psu.name}
            description={guide.components.psu.description}
            price={guide.components.psu.estimatedPrice}
            storeCount={0}
          />
          
          <ComponentRow 
            label="GABINETE"
            name={guide.components.case.name}
            description={guide.components.case.description}
            price={guide.components.case.estimatedPrice}
            storeCount={0}
          />
        </div>
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
                <div key={i} className="flex justify-between text-[10px] font-mono">
                  <span>{game.game}</span>
                  <span>{game.fps} FPS ({game.settings})</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="border-2 border-border p-4">
            <h3 className="text-[11px] font-bold mb-3">Productividad</h3>
            <div className="space-y-2">
              {guide.productivity.map((task, i) => (
                <div key={i} className="flex justify-between text-[10px] font-mono">
                  <span>{task.task}</span>
                  <span>{task.performance}</span>
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

      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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
    </main>
  );
}

function ComponentRow({ 
  label, 
  name, 
  description, 
  price, 
  storeCount,
  productId 
}: { 
  label: string;
  name: string;
  description: string;
  price: number;
  storeCount: number;
  productId?: string;
}) {
  return (
    <div className="border-2 border-border p-4 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex-1">
        <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
        <h3 className="text-[12px] font-bold">{name}</h3>
        <p className="text-[10px] text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="text-right">
        <div className="text-[16px] font-pixel text-primary">{formatPriceARS(price)}</div>
        {storeCount > 0 && (
          <div className="text-[10px] text-muted-foreground">{storeCount} tiendas</div>
        )}
        {productId && (
          <Link 
            href={`/product/${productId}`} 
            className="text-[10px] text-primary hover:underline"
          >
            Ver precios →
          </Link>
        )}
      </div>
    </div>
  );
}
