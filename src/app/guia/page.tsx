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

      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ COMO USAR ESTAS GUIAS ]
        </h2>
        <div className="space-y-3 text-[11px] md:text-[12px] leading-relaxed normal-case text-foreground/85 font-mono">
          <p>
            Cada guía está diseñada para un presupuesto específico en pesos argentinos. Los precios se actualizan
            semanalmente consultando las principales tiendas de hardware del país. Los componentes seleccionados
            priorizan la compatibilidad, el rendimiento real y la disponibilidad de stock en Argentina.
          </p>
          <p>
            Las builds incluyen siempre: procesador, motherboard, memoria RAM, tarjeta gráfica, almacenamiento,
            fuente de alimentación y gabinete. No incluyen periféricos ni monitor, pero damos recomendaciones
            opcionales para completar tu setup. Antes de comprar, verificá que todos los componentes sean compatibles
            entre sí. Si tenés dudas, consultá nuestra sección de comparativas o contactanos para ayuda personalizada.
          </p>
          <p>
            El rendimiento indicado se basa en benchmarks reales con juegos populares en 2026. Los FPS pueden
            variar según la configuración gráfica, resolución y optimización del juego. Para gaming 1080p,
            cualquier build de $1.000.000+ es suficiente. Para 1440p high refresh, recomendamos $2.000.000+.
            Para 4K gaming, necesitás $3.000.000+ con GPU de gama alta.
          </p>
        </div>
      </section>

      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ CONSEJOS GENERALES ]
        </h2>
        <ul className="space-y-2 text-[11px] leading-relaxed normal-case text-foreground/85 font-mono">
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold shrink-0">01.</span>
            <span>Priorizá la GPU para gaming. Es el componente que más impacta en FPS.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold shrink-0">02.</span>
            <span>No escatimes en la fuente. Una mala PSU puede dañar todos los componentes.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold shrink-0">03.</span>
            <span>El SSD es obligatorio en 2026. No compres PC con HDD como disco principal.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold shrink-0">04.</span>
            <span>Verificá compatibilidad de socket y chipset antes de comprar CPU + motherboard.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold shrink-0">05.</span>
            <span>16GB RAM es el mínimo; 32GB recomendado para gaming moderno y multitarea.</span>
          </li>
        </ul>
      </section>

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

      <section className="mt-8 bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ PREGUNTAS FRECUENTES ]
        </h2>
        <div className="space-y-3 text-[11px] md:text-[12px] leading-relaxed normal-case text-foreground/85 font-mono">
          <div>
            <p className="font-bold text-primary mb-1">¿Se pueden comprar las partes por separado?</p>
            <p>Sí, cada componente tiene link directo a la tienda con mejor precio. Podés comprar todo junto o en partes según tu presupuesto mensual.</p>
          </div>
          <div>
            <p className="font-bold text-primary mb-1">¿Los precios incluyen envío?</p>
            <p>No, los precios son del producto solamente. El envío varía según la tienda y tu ubicación. Algunas tiendas ofrecen envío gratis en CABA y GBA.</p>
          </div>
          <div>
            <p className="font-bold text-primary mb-1">¿Qué pasa si un componente no tiene stock?</p>
            <p>Te sugerimos alternativas equivalentes dentro de la misma guía. También podés suscribirte a alertas de precio para saber cuándo vuelve el stock.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
