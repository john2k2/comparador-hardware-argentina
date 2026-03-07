// ============================================
// Price Utils - Utilidades para precios en ARS
// ============================================

import type { InstallmentInfo, PriceHistoryPoint } from './types';

// Formatear precio en ARS
export function formatPriceARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Formatear precio con decimales
export function formatPriceARSWithDecimals(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

// Convertir precio USD a ARS (tasa fija para demo)
export function convertUSDtoARS(usdPrice: number, rate: number = 1250): number {
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
