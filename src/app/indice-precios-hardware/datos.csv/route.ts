import { getHardwarePriceIndex } from '@/lib/price-index/server';

const CSV_HEADERS = 'fecha,categoria,indice,precio_mediano_ars,productos,ofertas';

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(): Promise<Response> {
  const snapshot = await getHardwarePriceIndex(90);
  const rows = snapshot.series
    .flatMap((series) => series.points.map((point) => ({ series, point })))
    .sort((left, right) => left.point.date.localeCompare(right.point.date) || left.series.id.localeCompare(right.series.id))
    .map(({ series, point }) => [
      point.date,
      series.label,
      point.index.toFixed(2),
      point.medianPriceArs.toFixed(2),
      point.productCount,
      point.offerCount,
    ].map(escapeCsv).join(','));

  return new Response(`${[CSV_HEADERS, ...rows].join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="indice-precios-hardware-argentina.csv"',
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
