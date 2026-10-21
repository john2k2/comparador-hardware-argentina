'use client';

import { useId, useState } from 'react';
import type { Product, ProductPrice } from '@/lib/types';
import { formatPriceARSWithDecimals as formatPriceARS } from '@/lib/price-utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import { compareFinalCosts } from '@/lib/product/final-cost-comparison';

export function FinalCostComparison({ product, prices, now }: { product: Product; prices: ProductPrice[]; now?: number }) {
  const id = useId();
  const [shipping, setShipping] = useState<Record<string, string>>({});
  const { rows, completed, winners, pending } = compareFinalCosts(product, prices, shipping, now);
  if (rows.length < 2) return null;
  return <details className="border-t border-border/50 pt-2">
    <summary className="min-h-11 cursor-pointer font-mono text-sm font-bold text-secondary">Comparar precio más envío</summary>
    <p id={`${id}-help`} className="my-3 font-body text-sm leading-relaxed text-muted-foreground">
      Consultá el envío a tu domicilio en cada tienda e ingresalo acá, sin separadores de miles. Poné 0 sólo si confirmaste retiro o envío sin cargo. Vacío significa sin confirmar. El cálculo queda en esta página.
    </p>
    <div className="space-y-4">
      {rows.map(({ key, offer, input, totalCents, invalid }, index) => <div key={key} className="border-2 border-border p-3 min-w-0">
        <p className="font-body text-sm font-bold break-words">{normalizeDisplayText(offer.storeName)} · {formatPriceARS(offer.price)}</p>
        <p className="font-body text-sm text-muted-foreground">{offer.priceCondition === 'special' ? 'Precio especial: confirmá el medio de pago.' : 'Confirmá el medio de pago de este precio.'}</p>
        <label htmlFor={`${id}-${index}`} className="block mt-2 font-body text-sm">Envío en {normalizeDisplayText(offer.storeName)} (ARS)</label>
        <input id={`${id}-${index}`} inputMode="decimal" type="text" value={input} maxLength={14}
          placeholder="Ej. 4500,50" aria-describedby={`${id}-help${invalid ? ` ${id}-error-${index}` : ''}`} aria-invalid={invalid}
          onChange={event => setShipping(previous => ({ ...previous, [key]: event.target.value }))}
          className="mt-1 min-h-11 w-full border-2 border-border bg-background px-3 font-body text-base" />
        {invalid && <p id={`${id}-error-${index}`} className="mt-1 font-body text-sm text-accent">Ingresá un importe positivo o cero, con hasta dos decimales y sin puntos de miles.</p>}
        <p className="mt-2 font-body text-sm">Producto + envío: <strong>{totalCents === null ? 'Sin confirmar' : formatPriceARS(totalCents / 100)}</strong></p>
      </div>)}
    </div>
    <div role="status" aria-live="polite" className="mt-3 font-body text-sm leading-relaxed">
      {winners.length > 0 ? <p>{winners.length > 1 ? 'Empate en el menor total' : 'Menor total'} entre las {completed.length} ofertas con envío cargado: <strong>{winners.map(row => normalizeDisplayText(row.offer.storeName)).join(' y ')} · {formatPriceARS(winners[0].totalCents! / 100)}</strong>.</p>
        : <p>Completá el envío de al menos dos tiendas para comparar los totales.</p>}
      {pending > 0 && <p className="mt-1">Falta confirmar el envío de {pending} {pending === 1 ? 'tienda' : 'tiendas'}; el resultado no las compara.</p>}
      <p className="mt-2 text-muted-foreground">Estimación con precios relevados en las últimas 24 h y envíos ingresados por vos. No incluye cargos adicionales ni recalcula cuotas; no reserva stock. Confirmá el total del comercio antes de pagar.</p>
    </div>
  </details>;
}
