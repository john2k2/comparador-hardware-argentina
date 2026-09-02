import Link from 'next/link';
import { GuideComponentRows } from '@/components/seo/GuideComponentRows';
import { EditorialUpdatedStamp } from '@/components/seo/EditorialUpdatedStamp';
import { GUIDE_SLOT_KEYS, type GuideSlotKey } from '@/lib/seo/budget-builder';
import { BUILDER_BUDGET_MAX, BUILDER_BUDGET_MIN } from '@/lib/seo/budget-query';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';
import { formatPriceARS } from '@/lib/price-utils';
import type { ResolvedGuideComponent, ResolvedGuideSlotTotals } from '@/lib/seo/budget-guide-pricing';

const PRESET_BUDGETS = [1_000_000, 1_500_000, 2_000_000, 3_000_000] as const;

type Props = {
  budget: number | null;
  submitted: boolean;
  resolved: ResolvedGuideSlotTotals<Record<GuideSlotKey, ResolvedGuideComponent>> | null;
};

export function ArmarPcView({ budget, submitted, resolved }: Props) {
  const slotCount = GUIDE_SLOT_KEYS.length;

  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="text-[10px] md:text-[11px] text-muted-foreground mb-6 font-mono flex flex-wrap gap-x-1 break-words">
        <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/guia" className="hover:text-primary transition-colors">Guías</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Armá tu PC</span>
      </nav>

      <header className="mb-8">
        <h1 className="font-mono! text-base md:text-[20px] md:font-pixel! text-primary mb-3 leading-snug tracking-normal break-words max-w-full">
          Armá tu PC gamer con un presupuesto
        </h1>
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono leading-relaxed">
          Ingresá un monto en pesos. Elegimos piezas en stock: mismo socket y generación de RAM,
          y una fuente que cubra el consumo estimado. No inventamos SKUs ni precios.
        </p>
        <div className="mt-3">
          <EditorialUpdatedStamp isoDate={EDITORIAL_UPDATED_AT} />
        </div>
      </header>

      <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
          [ TU PRESUPUESTO ]
        </h2>
        <form action="/guia/armar" method="get" className="space-y-4">
          <label htmlFor="pesos" className="block text-[10px] uppercase text-muted-foreground">
            Presupuesto en pesos argentinos
          </label>
          <input
            id="pesos"
            name="pesos"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={budget ? String(budget) : ''}
            placeholder="Ej: 1500000"
            className="flex min-h-12 w-full max-w-md rounded-none border-4 border-border bg-background px-3 py-3 text-[10px] uppercase text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-secondary"
          />
          <p className="text-[10px] text-muted-foreground font-mono">
            Entre {formatPriceARS(BUILDER_BUDGET_MIN)} y {formatPriceARS(BUILDER_BUDGET_MAX)}.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_BUDGETS.map((preset) => (
              <Link
                key={preset}
                href={`/guia/armar?pesos=${preset}`}
                className="inline-flex min-h-11 items-center border-2 border-border px-3 text-[10px] uppercase font-mono hover:border-primary"
              >
                {formatPriceARS(preset)}
              </Link>
            ))}
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center border-4 border-primary bg-primary px-4 text-[10px] uppercase font-bold text-primary-foreground"
          >
            Armar PC
          </button>
        </form>
        {submitted && !budget && (
          <p className="mt-4 text-[11px] font-mono text-destructive">
            Usá un presupuesto entre {formatPriceARS(BUILDER_BUDGET_MIN)} y {formatPriceARS(BUILDER_BUDGET_MAX)}.
          </p>
        )}
      </section>

      {resolved && budget && (
        <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
          <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
            [ PRESUPUESTO Y STOCK ]
          </h2>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="border-2 border-border p-4 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">PRESUPUESTO</div>
              <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">
                {formatPriceARS(budget)}
              </div>
            </div>
            <div className="border-2 border-border p-4 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">TOTAL CON STOCK</div>
              <div className="text-[16px] md:text-[24px] font-pixel text-primary break-words">
                {formatPriceARS(resolved.catalogTotal)}
              </div>
              <p className="mt-2 text-[10px] uppercase text-muted-foreground">
                {resolved.inStockSlots} de {slotCount} partes comprables
              </p>
            </div>
          </div>
          <GuideComponentRows slots={resolved} />
          <p className="mt-4 text-[10px] uppercase text-muted-foreground font-mono leading-relaxed">
            No publicamos FPS en este armado libre: el combo cambia con el stock y el monto.
          </p>
        </section>
      )}
    </div>
  );
}
