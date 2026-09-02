import type { PriceIndexSeries } from '@/lib/price-index/model';

type PriceIndexChartProps = {
  series: PriceIndexSeries[];
};

const WIDTH = 960;
const HEIGHT = 320;
const PADDING = { top: 28, right: 24, bottom: 42, left: 56 };
const SERIES_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--accent)', 'var(--foreground)'];

function buildStepPath(
  points: PriceIndexSeries['points'],
  minDate: number,
  maxDate: number,
  minIndex: number,
  maxIndex: number,
): string {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const dateRange = Math.max(1, maxDate - minDate);
  const indexRange = Math.max(1, maxIndex - minIndex);
  const coordinates = points.map((point) => ({
    x: PADDING.left + ((Date.parse(`${point.date}T00:00:00.000Z`) - minDate) / dateRange) * plotWidth,
    y: PADDING.top + (1 - ((point.index - minIndex) / indexRange)) * plotHeight,
  }));

  const first = coordinates[0];
  if (!first) return '';

  return coordinates.slice(1).reduce(
    (path, point) => `${path} H ${point.x.toFixed(2)} V ${point.y.toFixed(2)}`,
    `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`,
  );
}

export function PriceIndexChart({ series }: PriceIndexChartProps) {
  const points = series.flatMap((item) => item.points);
  if (points.length === 0) return null;

  const dates = points.map((point) => Date.parse(`${point.date}T00:00:00.000Z`));
  const indices = points.map((point) => point.index);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const rawMinIndex = Math.min(...indices);
  const rawMaxIndex = Math.max(...indices);
  const padding = Math.max(2, (rawMaxIndex - rawMinIndex) * 0.12);
  const minIndex = rawMinIndex - padding;
  const maxIndex = rawMaxIndex + padding;
  const startLabel = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(minDate);
  const endLabel = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(maxDate);

  return (
    <figure aria-labelledby="price-index-chart-caption">
      <div className="overflow-x-auto border-4 border-border bg-card p-2 md:p-4 [box-shadow:8px_8px_0_var(--border)]">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block min-w-[640px] w-full h-auto"
          role="img"
          aria-labelledby="price-index-chart-title price-index-chart-description"
        >
          <title id="price-index-chart-title">Evolución del índice de precios de hardware</title>
          <desc id="price-index-chart-description">
            Gráfico escalonado con base 100 al inicio de la serie para {series.map((item) => item.label).join(', ')}.
          </desc>
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="var(--card)" />
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = PADDING.top + ratio * (HEIGHT - PADDING.top - PADDING.bottom);
            const value = maxIndex - ratio * (maxIndex - minIndex);
            return (
              <g key={ratio}>
                <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="5 7" />
                <text x={PADDING.left - 9} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="12" fontFamily="monospace">
                  {value.toFixed(0)}
                </text>
              </g>
            );
          })}
          <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={HEIGHT - PADDING.bottom} y2={HEIGHT - PADDING.bottom} stroke="var(--foreground)" strokeWidth="2" />
          <text x={PADDING.left} y={HEIGHT - 14} fill="var(--muted-foreground)" fontSize="12" fontFamily="monospace">{startLabel}</text>
          <text x={WIDTH - PADDING.right} y={HEIGHT - 14} textAnchor="end" fill="var(--muted-foreground)" fontSize="12" fontFamily="monospace">{endLabel}</text>
          {series.map((item, index) => (
            <path
              key={item.id}
              d={buildStepPath(item.points, minDate, maxDate, minIndex, maxIndex)}
              fill="none"
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth="4"
              strokeLinejoin="miter"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <figcaption id="price-index-chart-caption" className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-[10px] font-mono text-foreground">
        {series.map((item, index) => (
          <span key={item.id} className="inline-flex items-center gap-2">
            <span className="h-1 w-7" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
