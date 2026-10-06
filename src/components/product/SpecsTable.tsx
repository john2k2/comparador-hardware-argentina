import type { Product } from '@/lib/types';
import { buildTechnicalSheet } from '@/lib/product/technical-sheet';

export function SpecsTable({ product }: { product: Product }) {
  const facts = buildTechnicalSheet(product);
  return (
    <section id="ficha-tecnica" className="min-w-0 bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow" aria-labelledby="technical-sheet-title">
      <h2 id="technical-sheet-title" className="text-base md:text-lg text-primary mb-4">Ficha técnica</h2>
      {facts.length ? (
        <dl className="font-body text-sm md:text-base">
          {facts.map((fact) => (
            <div key={fact.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 border-b border-border/40 py-3 last:border-b-0">
              <dt className="text-muted-foreground break-words">{fact.label}</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="font-body text-base leading-relaxed text-muted-foreground">Esta publicación todavía no aporta especificaciones técnicas detalladas. Revisá la ficha del fabricante y los datos de la tienda antes de comprar.</p>}
      <p className="font-body text-sm leading-relaxed text-muted-foreground mt-4 border-t border-border/40 pt-3">
        Fuente: atributos y descripción publicados por las tiendas. No completamos datos faltantes ni certificamos compatibilidad. El SKU de una tienda no se presenta como código del fabricante.
      </p>
    </section>
  );
}
