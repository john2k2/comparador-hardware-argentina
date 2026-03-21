'use client';

import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';

type SpecsTableProps = {
  product: Product;
};

export function SpecsTable({ product }: SpecsTableProps) {
  const specsEntries = Object.entries(product.specs ?? {}).map(([key, value]) => ([
    normalizeDisplayText(key),
    normalizeDisplayText(String(value)),
  ] as const));

  if (specsEntries.length === 0) {
    return null;
  }

  return (
    <div className="bg-card border-4 border-border p-6 pixel-shadow">
      <h3 className="text-[12px] font-bold uppercase mb-4 text-primary border-b-4 border-primary inline-block pb-1">
        STATS DEL ITEM
      </h3>
      <dl className="space-y-3">
        {specsEntries.map(([key, value]) => (
          <div key={key} className="flex justify-between text-[10px] uppercase border-b-2 border-muted border-dashed pb-2">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="font-bold text-foreground text-right ml-4">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
