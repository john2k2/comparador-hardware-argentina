export const PRICE_INDEX_CATEGORIES = [
  { id: 'procesadores', label: 'Procesadores' },
  { id: 'tarjetas-graficas', label: 'Tarjetas gráficas' },
  { id: 'memoria-ram', label: 'Memoria RAM' },
  { id: 'almacenamiento', label: 'Almacenamiento' },
] as const;

export type PriceIndexCategory = (typeof PRICE_INDEX_CATEGORIES)[number]['id'];

export type PriceIndexRpcRow = {
  day: unknown;
  category: unknown;
  median_price_ars: unknown;
  product_count: unknown;
  offer_count: unknown;
};

export type PriceIndexPoint = {
  date: string;
  index: number;
  medianPriceArs: number;
  productCount: number;
  offerCount: number;
};

export type PriceIndexSeries = {
  id: PriceIndexCategory;
  label: string;
  points: PriceIndexPoint[];
  variations: {
    days7: number | null;
    days30: number | null;
    days90: number | null;
  };
};

export type PriceIndexSnapshot = {
  status: 'ready' | 'empty';
  updatedAt: string | null;
  coverage: {
    startDate: string;
    endDate: string;
    productCount: number;
    offerCount: number;
    categoryCount: number;
  } | null;
  series: PriceIndexSeries[];
};

const EMPTY_SNAPSHOT: PriceIndexSnapshot = {
  status: 'empty',
  updatedAt: null,
  coverage: null,
  series: [],
};

export function createEmptyPriceIndexSnapshot(): PriceIndexSnapshot {
  return { ...EMPTY_SNAPSHOT, series: [] };
}

export function normalizePriceIndexDays(value: number): number {
  if (!Number.isFinite(value)) return 90;
  return Math.min(365, Math.max(7, Math.trunc(value)));
}

function asPositiveNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? value : null;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateVariation(points: PriceIndexPoint[], days: number): number | null {
  const latest = points.at(-1);
  if (!latest) return null;

  const target = Date.parse(`${latest.date}T00:00:00.000Z`) - days * 86_400_000;
  const comparison = [...points]
    .reverse()
    .find((point) => Date.parse(`${point.date}T00:00:00.000Z`) <= target);

  if (!comparison || comparison.medianPriceArs <= 0) return null;
  return round(((latest.medianPriceArs / comparison.medianPriceArs) - 1) * 100);
}

export function buildPriceIndexSnapshot(rows: PriceIndexRpcRow[] | null | undefined): PriceIndexSnapshot {
  const categoryMap = new Map(PRICE_INDEX_CATEGORIES.map((category) => [category.id, category]));
  const grouped = new Map<PriceIndexCategory, Array<Omit<PriceIndexPoint, 'index'>>>();

  for (const row of rows ?? []) {
    const category = typeof row.category === 'string'
      ? categoryMap.get(row.category as PriceIndexCategory)
      : undefined;
    const date = asIsoDate(row.day);
    const medianPriceArs = asPositiveNumber(row.median_price_ars);
    const productCount = asNonNegativeInteger(row.product_count);
    const offerCount = asNonNegativeInteger(row.offer_count);

    if (!category || !date || medianPriceArs === null || productCount === null || offerCount === null) continue;

    const points = grouped.get(category.id) ?? [];
    points.push({ date, medianPriceArs, productCount, offerCount });
    grouped.set(category.id, points);
  }

  const series = PRICE_INDEX_CATEGORIES.flatMap<PriceIndexSeries>((category) => {
    const rawPoints = grouped.get(category.id)?.sort((left, right) => left.date.localeCompare(right.date)) ?? [];
    const basePrice = rawPoints[0]?.medianPriceArs;
    if (!basePrice) return [];

    const points = rawPoints.map((point) => ({
      ...point,
      index: round((point.medianPriceArs / basePrice) * 100),
    }));

    return [{
      ...category,
      points,
      variations: {
        days7: calculateVariation(points, 7),
        days30: calculateVariation(points, 30),
        days90: calculateVariation(points, 90),
      },
    }];
  });

  if (series.length === 0) return createEmptyPriceIndexSnapshot();

  const allPoints = series.flatMap((item) => item.points);
  const startDate = allPoints.reduce((earliest, point) => point.date < earliest ? point.date : earliest, allPoints[0].date);
  const endDate = allPoints.reduce((latest, point) => point.date > latest ? point.date : latest, allPoints[0].date);
  const latestPoints = series
    .map((item) => [...item.points].reverse().find((point) => point.date <= endDate))
    .filter((point): point is PriceIndexPoint => Boolean(point));

  return {
    status: 'ready',
    updatedAt: `${endDate}T00:00:00.000Z`,
    coverage: {
      startDate,
      endDate,
      productCount: latestPoints.reduce((total, point) => total + point.productCount, 0),
      offerCount: latestPoints.reduce((total, point) => total + point.offerCount, 0),
      categoryCount: series.length,
    },
    series,
  };
}
