import type { HardwareCategory, Product } from '@/lib/types';
import { getComparableStorePrices } from '@/lib/price-utils';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { findPerformanceBenchmark, type PerformanceBenchmark } from './performance-benchmarks';

export const COMPARABLE_CATEGORIES: Array<{ id: HardwareCategory; label: string }> = [
  { id: 'procesadores', label: 'Procesadores' },
  { id: 'tarjetas-graficas', label: 'Placas de video' },
  { id: 'motherboards', label: 'Motherboards' },
  { id: 'memoria-ram', label: 'Memoria RAM' },
  { id: 'almacenamiento', label: 'Almacenamiento' },
  { id: 'fuentes-alimentacion', label: 'Fuentes' },
  { id: 'gabinetes', label: 'Gabinetes' },
  { id: 'refrigeracion', label: 'Refrigeración' },
  { id: 'computadoras', label: 'Computadoras armadas' },
  { id: 'perifericos', label: 'Periféricos' },
];

export const COMPARISON_USE_CASES = [
  { id: 'gaming', label: 'Gaming', description: 'FPS, resolución, VRAM y costo total del equipo.' },
  { id: 'productividad', label: 'Producción y trabajo', description: 'Render, edición, compilación y cargas sostenidas.' },
  { id: 'uso-diario', label: 'Uso diario', description: 'Respuesta rápida, consumo y costo sin pagar capacidad innecesaria.' },
  { id: 'equilibrado', label: 'Uso mixto', description: 'Balance entre respuesta, trabajo pesado y precio.' },
] as const;

export type ComparisonUseCase = typeof COMPARISON_USE_CASES[number]['id'];

export type DynamicComparison = {
  leftPrice: number | null;
  rightPrice: number | null;
  difference: number | null;
  differencePercent: number | null;
  cheaperProductId: string | null;
  recommendation: string;
  evidence: string[];
  leftOffers: Array<{ store: string; price: number }>;
  rightOffers: Array<{ store: string; price: number }>;
  leftBenchmark: PerformanceBenchmark | null;
  rightBenchmark: PerformanceBenchmark | null;
  valueWinnerProductId: string | null;
  valueDifferencePercent: number | null;
  useCase: ComparisonUseCase;
  metricLabel: string | null;
  leftMetricScore: number | null;
  rightMetricScore: number | null;
  specificationRows: Array<{ label: string; left: string; right: string }>;
};

function comparableOffers(product: Product) {
  return getComparableStorePrices(
    product.prices.filter((offer) => !needsIdentityReview(offer)),
  )
    .filter((offer) => offer.price > 0 && (offer.stock === 'in-stock' || offer.stock === 'low-stock'))
    .sort((a, b) => a.price - b.price);
}

function normalizeSpecLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildSpecificationRows(left: Product, right: Product) {
  const keys = Array.from(new Set([...Object.keys(left.specs), ...Object.keys(right.specs)]));
  return keys
    .filter((key) => left.specs[key] || right.specs[key])
    .slice(0, 14)
    .map((key) => ({
      label: normalizeSpecLabel(key),
      left: left.specs[key] || 'No informado',
      right: right.specs[key] || 'No informado',
    }));
}

function compatibilityEvidence(category: HardwareCategory, left: Product, right: Product): string[] {
  const specs = (product: Product, candidates: string[]) => {
    const entry = Object.entries(product.specs).find(([key]) => candidates.some((candidate) => key.toLowerCase().includes(candidate)));
    return entry?.[1];
  };

  if (category === 'procesadores' || category === 'motherboards') {
    const leftSocket = specs(left, ['socket']);
    const rightSocket = specs(right, ['socket']);
    if (leftSocket && rightSocket) {
      return [leftSocket.toLowerCase() === rightSocket.toLowerCase()
        ? `Ambos informan socket ${leftSocket}.`
        : `Usan sockets distintos (${leftSocket} y ${rightSocket}); pueden exigir plataformas diferentes.`];
    }
  }

  if (category === 'fuentes-alimentacion') {
    return ['Además del precio, verificá potencia real, certificación, conectores, garantía y protecciones eléctricas.'];
  }

  if (category === 'tarjetas-graficas') {
    return ['Además del precio, compará rendimiento en tu resolución, VRAM, consumo, conectores y espacio del gabinete.'];
  }

  return [];
}

function scoreForUseCase(benchmark: PerformanceBenchmark, category: HardwareCategory, useCase: ComparisonUseCase): { score: number; label: string } | null {
  if (category === 'tarjetas-graficas') {
    if (useCase === 'productividad') return null;
    return { score: benchmark.primaryScore, label: 'rendimiento gráfico relativo' };
  }
  if (category === 'procesadores') {
    if (useCase === 'gaming') return null;
    if (useCase === 'uso-diario' && benchmark.secondaryScore != null) {
      return { score: benchmark.secondaryScore, label: 'rendimiento de un núcleo' };
    }
    if (useCase === 'equilibrado' && benchmark.secondaryScore != null) {
      return {
        score: ((benchmark.secondaryScore / 2500) + (benchmark.primaryScore / 15000)) * 50,
        label: 'índice mixto de uno y varios núcleos',
      };
    }
    return { score: benchmark.primaryScore, label: 'rendimiento multinúcleo' };
  }
  return null;
}

function buildUseCaseCaveat(category: HardwareCategory, useCase: ComparisonUseCase): string | null {
  if (category === 'procesadores' && useCase === 'gaming') {
    return 'Para gaming en CPU no usamos Geekbench como si fueran FPS. El juego, la resolución, la GPU y tecnologías como 3D V-Cache pueden cambiar el resultado.';
  }
  if (category === 'tarjetas-graficas' && useCase === 'productividad') {
    return 'Para producción con GPU hace falta medir la aplicación concreta: CUDA, render, IA, edición, VRAM y drivers pueden cambiar el ganador.';
  }
  return null;
}

export function compareProducts(left: Product, right: Product, useCase: ComparisonUseCase = 'equilibrado'): DynamicComparison {
  const leftComparableOffers = comparableOffers(left);
  const rightComparableOffers = comparableOffers(right);
  const leftPrice = leftComparableOffers[0]?.price ?? null;
  const rightPrice = rightComparableOffers[0]?.price ?? null;
  const bothPriced = leftPrice != null && rightPrice != null;
  const difference = bothPriced ? Math.abs(leftPrice - rightPrice) : null;
  const baseline = bothPriced ? Math.min(leftPrice, rightPrice) : null;
  const differencePercent = difference != null && baseline ? Math.round((difference / baseline) * 100) : null;
  const cheaperProductId = bothPriced && leftPrice !== rightPrice
    ? (leftPrice < rightPrice ? left.id : right.id)
    : null;
  const leftBenchmark = findPerformanceBenchmark(left);
  const rightBenchmark = findPerformanceBenchmark(right);
  const leftMetric = leftBenchmark ? scoreForUseCase(leftBenchmark, left.category, useCase) : null;
  const rightMetric = rightBenchmark ? scoreForUseCase(rightBenchmark, right.category, useCase) : null;
  const bothBenchmarked = leftMetric && rightMetric && leftPrice && rightPrice;
  const leftValue = bothBenchmarked ? leftMetric.score / leftPrice : null;
  const rightValue = bothBenchmarked ? rightMetric.score / rightPrice : null;
  const valueWinnerProductId = leftValue && rightValue && leftValue !== rightValue
    ? (leftValue > rightValue ? left.id : right.id)
    : null;
  const valueDifferencePercent = leftValue && rightValue
    ? Math.round((Math.abs(leftValue - rightValue) / Math.min(leftValue, rightValue)) * 100)
    : null;

  let recommendation = 'No hay dos precios comparables en stock para declarar cuál conviene hoy.';
  if (bothPriced && leftPrice === rightPrice) {
    recommendation = 'Cuestan lo mismo hoy. Elegí por prestaciones, compatibilidad y garantía.';
  } else if (cheaperProductId) {
    const cheaper = cheaperProductId === left.id ? left : right;
    recommendation = `${cheaper.name} es la opción de menor precio hoy. La diferencia por sí sola no prueba mejor rendimiento por peso.`;
  }
  if (valueWinnerProductId && valueDifferencePercent != null) {
    const winner = valueWinnerProductId === left.id ? left : right;
    recommendation = `${winner.name} conviene más para ${COMPARISON_USE_CASES.find((entry) => entry.id === useCase)?.label.toLowerCase()}: entrega aproximadamente ${valueDifferencePercent}% más ${leftMetric?.label ?? 'puntaje de referencia'} por peso al precio relevado hoy.`;
  }

  return {
    leftPrice,
    rightPrice,
    difference,
    differencePercent,
    cheaperProductId,
    recommendation,
    evidence: [
      ...compatibilityEvidence(left.category, left, right),
      ...(buildUseCaseCaveat(left.category, useCase) ? [buildUseCaseCaveat(left.category, useCase)!] : []),
      bothBenchmarked
        ? `El valor usa ${leftMetric.label} y ofertas en stock cuya identidad fue validada.`
        : 'No hay benchmarks compatibles para ambos modelos; la recomendación no inventa rendimiento faltante.',
    ],
    leftOffers: leftComparableOffers.slice(0, 5).map((offer) => ({ store: offer.storeName || offer.storeId, price: offer.price })),
    rightOffers: rightComparableOffers.slice(0, 5).map((offer) => ({ store: offer.storeName || offer.storeId, price: offer.price })),
    leftBenchmark,
    rightBenchmark,
    valueWinnerProductId,
    valueDifferencePercent,
    useCase,
    metricLabel: leftMetric?.label ?? null,
    leftMetricScore: leftMetric?.score ?? null,
    rightMetricScore: rightMetric?.score ?? null,
    specificationRows: buildSpecificationRows(left, right),
  };
}
