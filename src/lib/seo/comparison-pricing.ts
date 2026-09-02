import { getComparableStorePrices } from '@/lib/price-utils';
import type { ProductPrice } from '@/lib/types';

export type ComparisonSidePricing = {
  prices: ProductPrice[];
  offerCount: number;
  bestPrice: number | null;
};

export type ComparisonPricing = {
  side1: ComparisonSidePricing;
  side2: ComparisonSidePricing;
  storeCount: number;
  canDeclareWinner: boolean;
  cheaperName: string | null;
  priceDiff: number | null;
  storeCoverageCopy: string;
};

function inStockComparable(prices: ProductPrice[] | undefined): ProductPrice[] {
  return getComparableStorePrices(prices ?? [])
    .filter((price) => price.price > 0 && price.stock !== 'out-of-stock')
    .sort((a, b) => a.price - b.price);
}

function toSide(prices: ProductPrice[]): ComparisonSidePricing {
  return {
    prices,
    offerCount: prices.length,
    bestPrice: prices[0]?.price ?? null,
  };
}

function uniqueStoreCount(left: ProductPrice[], right: ProductPrice[]): number {
  return new Set([...left, ...right].map((price) => price.storeId)).size;
}

function buildStoreCoverageCopy(storeCount: number): string {
  if (storeCount === 0) {
    return 'Hoy no hay ofertas en stock para comparar el precio de estos modelos.';
  }
  if (storeCount === 1) {
    return 'Los precios de esta comparativa salen de 1 tienda con stock.';
  }
  return `Los precios de esta comparativa salen de ${storeCount} tiendas con stock.`;
}

export function resolveComparisonPricing(input: {
  product1Name: string;
  product2Name: string;
  product1Prices?: ProductPrice[];
  product2Prices?: ProductPrice[];
}): ComparisonPricing {
  const side1Prices = inStockComparable(input.product1Prices);
  const side2Prices = inStockComparable(input.product2Prices);
  const side1 = toSide(side1Prices);
  const side2 = toSide(side2Prices);
  const storeCount = uniqueStoreCount(side1Prices, side2Prices);
  const left = side1.bestPrice;
  const right = side2.bestPrice;
  const bothHaveOffers = left != null && right != null;
  const priceDiff = bothHaveOffers ? Math.abs(left - right) : null;
  const canDeclareWinner = Boolean(bothHaveOffers && priceDiff && priceDiff > 0);
  const cheaperName = canDeclareWinner && left != null && right != null
    ? (left < right ? input.product1Name : input.product2Name)
    : null;

  return {
    side1,
    side2,
    storeCount,
    canDeclareWinner,
    cheaperName,
    priceDiff,
    storeCoverageCopy: buildStoreCoverageCopy(storeCount),
  };
}
