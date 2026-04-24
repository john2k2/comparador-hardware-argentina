// ============================================
// Price Utils - Utilidades para precios en ARS
// ============================================

import type { InstallmentInfo, PriceHistoryPoint, ProductPrice } from './types';

type PriceLike = { price: number };
type StorePriceLike = PriceLike & {
  storeId: string;
  lastUpdated?: Date | string | number;
  stock?: string | null;
};

// Umbrales para deteccion de outliers en precios
// UPPER_OUTLIER_RATIO = 2.6 → un precio 2.6x por encima de la mediana se considera outlier
// LOWER_OUTLIER_RATIO = 0.38 → un precio 0.38x por debajo de la mediana se considera outlier
// OUTLIER_MIN_DELTA_ARS = 50.000 → diferencia minima en ARS para considerar outlier (evita falsos positivos en productos baratos)
// PAIR_OUTLIER_RATIO = 4 → cuando solo hay 2 precios, si uno es 4x mayor se descarta
// PAIR_OUTLIER_MIN_DELTA_ARS = 150.000 → diferencia minima para par de 2 precios
//
// Estos valores se ajustaron empiricamente con datos reales de tiendas argentinas
// para balancear entre eliminar errores absurdos (ej: $24.849.611 en vez de $248.496)
// y no descartar variaciones legitimas de precio entre tiendas.
const UPPER_OUTLIER_RATIO = 2.6;
const LOWER_OUTLIER_RATIO = 0.38;
const OUTLIER_MIN_DELTA_ARS = 50_000;
const PAIR_OUTLIER_RATIO = 4;
const PAIR_OUTLIER_MIN_DELTA_ARS = 150_000;

function isFinitePositivePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function toTimestamp(value: Date | string | number | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function isUpperOutlier(price: number, medianPrice: number): boolean {
  if (medianPrice <= 0) return false;
  return (
    price / medianPrice >= UPPER_OUTLIER_RATIO
    && price - medianPrice >= Math.max(OUTLIER_MIN_DELTA_ARS, Math.round(medianPrice * 0.35))
  );
}

function isLowerOutlier(price: number, medianPrice: number): boolean {
  if (medianPrice <= 0) return false;
  return (
    price / medianPrice <= LOWER_OUTLIER_RATIO
    && medianPrice - price >= Math.max(OUTLIER_MIN_DELTA_ARS, Math.round(medianPrice * 0.35))
  );
}

export function parseLocalizedArsPrice(value: string): number {
  if (!value) return 0;

  let normalized = value
    .replace(/[^\d.,$-]/g, ' ')
    .trim();

  if (!normalized) return 0;

  // Extraer todos los montos numericos (evita concatenar cuotas u otros numeros)
  // Busca patrones como: 248.496, 248496, 248.496,50, $248496
  const priceMatches = normalized.match(/[\d]+(?:[\.,]\d{3})*(?:[\.,]\d{1,2})?/g);
  if (!priceMatches || priceMatches.length === 0) return 0;

  // Convertir todos los matches a numeros
  const prices = priceMatches.map(match => {
    let num = match;
    const hasComma = num.includes(',');
    const hasDot = num.includes('.');
    const hasThousandsDot = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(num);
    const hasThousandsComma = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(num);

    if (hasThousandsDot) {
      num = num.replace(/\./g, '').replace(',', '.');
    } else if (hasThousandsComma) {
      num = num.replace(/,/g, '');
    } else if (hasComma && !hasDot) {
      num = /,\d{1,2}$/.test(num)
        ? num.replace(',', '.')
        : num.replace(/,/g, '');
    } else if (!hasComma && hasDot && /^\d{1,3}(?:\.\d{3})+$/.test(num)) {
      num = num.replace(/\./g, '');
    }

    return Number.parseFloat(num);
  }).filter(n => Number.isFinite(n) && n > 0);

  if (prices.length === 0) return 0;
  if (prices.length === 1) return Math.round(prices[0]);

  // Estrategia inteligente para multiples numeros:
  // 1. Si hay "antes/ahora" o similar, tomar el ultimo (precio actual)
  const lowerValue = value.toLowerCase();
  const hasBeforeAfter = /antes|before|precio\s*anterior|precio\s*lista/i.test(lowerValue);
  const hasNow = /ahora|now|oferta|descuento|precio\s*final/i.test(lowerValue);
  
  if (hasBeforeAfter || hasNow) {
    // Tomar el ultimo numero (precio actual despues del descuento)
    return Math.round(prices[prices.length - 1]);
  }

  // 2. Si hay palabras de cuotas, filtrar numeros muy pequenos (cuotas)
  const hasInstallments = /cuota|cuotas|pago|mes/i.test(lowerValue);
  if (hasInstallments) {
    // Filtrar cuotas (generalmente menores a 100.000)
    const nonInstallmentPrices = prices.filter(p => p >= 100_000);
    if (nonInstallmentPrices.length > 0) {
      return Math.round(Math.min(...nonInstallmentPrices));
    }
  }

  // 3. Por defecto: tomar el mayor (precio principal vs cuotas)
  return Math.round(Math.max(...prices));
}

export function pickBestStorePrices<T extends StorePriceLike>(prices: T[]): T[] {
  const bestByStore = new Map<string, T>();

  for (const price of prices) {
    if (!price.storeId || !isFinitePositivePrice(price.price)) continue;

    const storeKey = price.storeId.toLowerCase();
    const currentBest = bestByStore.get(storeKey);

    if (!currentBest) {
      bestByStore.set(storeKey, price);
      continue;
    }

    if (price.price < currentBest.price) {
      bestByStore.set(storeKey, price);
      continue;
    }

    if (currentBest.stock === 'out-of-stock' && price.stock !== 'out-of-stock') {
      bestByStore.set(storeKey, price);
      continue;
    }

    if (price.price === currentBest.price && toTimestamp(price.lastUpdated) > toTimestamp(currentBest.lastUpdated)) {
      bestByStore.set(storeKey, price);
    }
  }

  return Array.from(bestByStore.values()).sort((a, b) => a.price - b.price);
}

export function filterPriceOutliers<T extends PriceLike>(
  prices: T[],
): { comparablePrices: T[]; discardedPrices: T[] } {
  const validPrices = prices
    .filter((price) => isFinitePositivePrice(price.price))
    .sort((a, b) => a.price - b.price);

  if (validPrices.length <= 1) {
    return {
      comparablePrices: validPrices,
      discardedPrices: [],
    };
  }

  if (validPrices.length === 2) {
    const [lowest, highest] = validPrices;
    const ratio = highest.price / Math.max(lowest.price, 1);
    const delta = highest.price - lowest.price;

    if (ratio >= PAIR_OUTLIER_RATIO && delta >= PAIR_OUTLIER_MIN_DELTA_ARS) {
      return {
        comparablePrices: [lowest],
        discardedPrices: [highest],
      };
    }

    return {
      comparablePrices: validPrices,
      discardedPrices: [],
    };
  }

  const medianPrice = getMedian(validPrices.map((price) => price.price));
  const comparablePrices: T[] = [];
  const discardedPrices: T[] = [];

  for (const price of validPrices) {
    if (isUpperOutlier(price.price, medianPrice) || isLowerOutlier(price.price, medianPrice)) {
      discardedPrices.push(price);
      continue;
    }
    comparablePrices.push(price);
  }

  if (comparablePrices.length === 0) {
    return {
      comparablePrices: validPrices,
      discardedPrices: [],
    };
  }

  return {
    comparablePrices,
    discardedPrices,
  };
}

export function computeComparablePriceStats<T extends PriceLike>(
  prices: T[],
): {
  comparablePrices: T[];
  discardedPrices: T[];
  lowest: number;
  highest: number;
  average: number;
} {
  const { comparablePrices, discardedPrices } = filterPriceOutliers(prices);

  if (comparablePrices.length === 0) {
    return {
      comparablePrices: [],
      discardedPrices,
      lowest: 0,
      highest: 0,
      average: 0,
    };
  }

  const values = comparablePrices.map((price) => price.price);
  return {
    comparablePrices,
    discardedPrices,
    lowest: Math.min(...values),
    highest: Math.max(...values),
    average: Math.round(values.reduce((acc, value) => acc + value, 0) / values.length),
  };
}

export function computeComparableStorePriceStats(prices: ProductPrice[]) {
  return computeComparablePriceStats(pickBestStorePrices(prices));
}

export function getComparableStorePrices(prices: ProductPrice[]): ProductPrice[] {
  return computeComparableStorePriceStats(prices).comparablePrices;
}

// Instancias reutilizables para formateo de precios (evitar creacion en cada llamada)
const ARS_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const ARS_FORMATTER_DECIMALS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Formatear precio en ARS
export function formatPriceARS(amount: number): string {
  return ARS_FORMATTER.format(amount);
}

// Formatear precio con decimales
export function formatPriceARSWithDecimals(amount: number): string {
  return ARS_FORMATTER_DECIMALS.format(amount);
}

// Calcular precio por cuota
export function calculateInstallment(
  totalPrice: number,
  installmentCount: number,
  interestRate: number = 0
): InstallmentInfo {
  const interestMultiplier = 1 + interestRate;
  const totalWithInterest = totalPrice * interestMultiplier;
  const installmentAmount = totalWithInterest / installmentCount;
  
  return {
    count: installmentCount,
    amount: Math.round(installmentAmount),
    totalAmount: Math.round(totalWithInterest),
    interest: interestRate > 0,
  };
}

// Calcular el mejor precio
export function findLowestPrice(prices: { price: number }[]): number {
  if (!prices || prices.length === 0) return 0;
  return Math.min(...prices.map((p) => p.price));
}

// Calcular el precio más alto
export function findHighestPrice(prices: { price: number }[]): number {
  if (!prices || prices.length === 0) return 0;
  return Math.max(...prices.map((p) => p.price));
}

// Calcular precio promedio
export function calculateAveragePrice(prices: { price: number }[]): number {
  if (!prices || prices.length === 0) return 0;
  const sum = prices.reduce((acc, p) => acc + p.price, 0);
  return Math.round(sum / prices.length);
}

// Calcular porcentaje de descuento
export function calculateDiscount(originalPrice: number, currentPrice: number): number {
  if (!originalPrice || originalPrice <= 0) return 0;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

// Calcular variación de precio
export function calculatePriceChange(
  currentPrice: number,
  previousPrice: number
): { amount: number; percentage: number; direction: 'up' | 'down' | 'same' } {
  const amount = currentPrice - previousPrice;
  const percentage = previousPrice > 0 
    ? Math.round((amount / previousPrice) * 100) 
    : 0;
  
  let direction: 'up' | 'down' | 'same' = 'same';
  if (amount > 0) direction = 'up';
  else if (amount < 0) direction = 'down';
  
  return { amount, percentage, direction };
}

// Obtener precio con descuento
export function getDiscountedPrice(price: number, discount: number): number {
  return Math.round(price * (1 - discount / 100));
}

// Calcular precio por marca (para comparar)
export function calculatePricePerBrand(
  products: { brand: string; lowestPrice: number }[]
): Record<string, number> {
  return products.reduce((acc, product) => {
    if (!acc[product.brand]) {
      acc[product.brand] = product.lowestPrice;
    } else {
      acc[product.brand] = Math.min(acc[product.brand], product.lowestPrice);
    }
    return acc;
  }, {} as Record<string, number>);
}

// Obtener rango de precios
export function getPriceRange(
  prices: { price: number }[]
): { min: number; max: number } {
  if (!prices || prices.length === 0) {
    return { min: 0, max: 0 };
  }
  
  const priceValues = prices.map((p) => p.price);
  return {
    min: Math.min(...priceValues),
    max: Math.max(...priceValues),
  };
}

// Crear puntos de historial de precios
export function createPriceHistory(
  prices: { date: Date | string; price: number; storeId: string }[]
): PriceHistoryPoint[] {
  return prices.map((p) => ({
    date: typeof p.date === 'string' ? new Date(p.date) : p.date,
    price: p.price,
    storeId: p.storeId,
  }));
}

// Ordenar precios por tienda
export function sortPricesByStore(
  prices: { storeName: string; price: number }[],
  storePriority: string[]
): { storeName: string; price: number }[] {
  return [...prices].sort((a, b) => {
    const aIndex = storePriority.indexOf(a.storeName);
    const bIndex = storePriority.indexOf(b.storeName);
    
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    
    return aIndex - bIndex;
  });
}

// Obtener mejor opción de cuotas
export function getBestInstallmentOption(
  installments: { count: number; totalAmount: number; interest: boolean }[]
): { count: number; amount: number; totalAmount: number; interest: boolean } | null {
  if (!installments || installments.length === 0) return null;
  
  // Preferir cuotas sin interés, luego menor cantidad de cuotas
  const sorted = [...installments].sort((a, b) => {
    // Si uno tiene interés y otro no, priorizar sin interés
    if (a.interest !== b.interest) {
      return a.interest ? 1 : -1;
    }
    // Mismo interés, priorizar menos cuotas
    return a.count - b.count;
  });
  
  return {
    count: sorted[0].count,
    amount: Math.round(sorted[0].totalAmount / sorted[0].count),
    totalAmount: sorted[0].totalAmount,
    interest: sorted[0].interest,
  };
}

// Convertir precio USD a ARS
// NOTA: La tasa de cambio en Argentina es muy volatil.
// Este valor deberia actualizarse periodicamente o leerse de una fuente externa.
// Tasa de referencia aproximada (blue/informal) a abril 2026.
export function convertUSDtoARS(usdPrice: number, rate: number = 1300): number {
  return Math.round(usdPrice * rate);
}

// Obtener color según precio (barato = verde, caro = rojo)
export function getPriceColor(
  price: number,
  minPrice: number,
  maxPrice: number
): string {
  if (maxPrice === minPrice) return 'text-gray-600';
  
  const percentage = (price - minPrice) / (maxPrice - minPrice);
  
  if (percentage < 0.33) return 'text-green-600';
  if (percentage < 0.66) return 'text-yellow-600';
  return 'text-red-600';
}
