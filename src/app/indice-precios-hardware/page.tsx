import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PriceIndexChart } from '@/components/price-index/PriceIndexChart';
import {
  PRICE_INDEX_CATEGORIES,
  type PriceIndexSeries,
  type PriceIndexSnapshot,
} from '@/lib/price-index/model';
import { getHardwarePriceIndex } from '@/lib/price-index/server';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';

const PAGE_URL = `${SITE_URL}/indice-precios-hardware`;
const CSV_URL = `${PAGE_URL}/datos.csv`;

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Índice de precios de hardware en Argentina',
  description: 'Evolución agregada de precios de procesadores, placas de video, memoria RAM y almacenamiento en tiendas argentinas.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: PAGE_URL,
    siteName: SITE_NAME,
    title: 'Índice de precios de hardware en Argentina',
    description: 'Series diarias con base 100, cobertura y metodología pública.',
  },
};

type JsonLdEntry = Record<string, unknown> & { '@type': string };

export function buildPriceIndexJsonLd(snapshot: PriceIndexSnapshot): { '@context': string; '@graph': JsonLdEntry[] } {
  const temporalCoverage = snapshot.coverage
    ? `${snapshot.coverage.startDate}/${snapshot.coverage.endDate}`
    : undefined;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${PAGE_URL}#webpage`,
        url: PAGE_URL,
        name: 'Índice de precios de hardware en Argentina',
        description: 'Evolución agregada de precios de componentes informáticos en tiendas argentinas.',
        inLanguage: 'es-AR',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        mainEntity: { '@id': `${PAGE_URL}#dataset` },
      },
      {
        '@type': 'Dataset',
        '@id': `${PAGE_URL}#dataset`,
        name: 'Series agregadas de precios de hardware en Argentina',
        description: 'Mediana diaria del menor precio por producto para cuatro categorías de hardware, expresada en pesos argentinos y como índice base 100.',
        url: PAGE_URL,
        inLanguage: 'es-AR',
        temporalCoverage,
        dateModified: snapshot.updatedAt ?? undefined,
        creator: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        variableMeasured: ['Precio mediano en pesos argentinos', 'Índice base 100', 'Productos', 'Ofertas'],
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'text/csv',
          contentUrl: CSV_URL,
        },
      },
    ],
  };
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatVariation(value: number | null): string {
  if (value === null) return 's/d';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function getLatestPoint(series: PriceIndexSeries) {
  return series.points.at(-1);
}

export function PriceIndexPageContent({ snapshot, nonce }: { snapshot: PriceIndexSnapshot; nonce?: string }) {
  const jsonLd = buildPriceIndexJsonLd(snapshot);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 md:px-8 md:py-14">
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <header className="border-l-8 border-primary pl-5 md:pl-8">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary">
          Mercado argentino · ventana móvil de 90 días
        </p>
        <h1 className="max-w-5xl font-pixel text-[20px] leading-[1.7] text-foreground md:text-[32px]">
          Qué pasó con el precio del hardware esta semana
        </h1>
        <p className="mt-5 max-w-3xl font-mono text-[12px] normal-case leading-7 text-muted-foreground md:text-[14px]">
          Seguimos la mediana del menor precio disponible por producto. La serie usa base 100 al comienzo de cada categoría para mostrar cambios sin mezclar escalas de precio.
        </p>
        <div className="mt-7 flex flex-wrap gap-4">
          <a
            href="/indice-precios-hardware/datos.csv"
            className="border-4 border-border bg-primary px-5 py-3 font-mono text-[10px] font-bold uppercase text-primary-foreground [box-shadow:5px_5px_0_var(--border)] hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Descargar datos agregados (.csv)
          </a>
          <a
            href="#metodologia"
            className="border-4 border-border bg-card px-5 py-3 font-mono text-[10px] font-bold uppercase text-foreground hover:bg-muted focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Leer metodología
          </a>
        </div>
      </header>

      <nav aria-label="Explorar categorías del índice" className="mt-10 border-y-4 border-border py-4">
        <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Explorar precios actuales</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {PRICE_INDEX_CATEGORIES.map((category) => (
            <Link
              key={category.id}
              href={`/search?category=${category.id}`}
              className="font-mono text-[10px] font-bold text-secondary underline decoration-2 underline-offset-4 hover:text-primary focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {category.label}
            </Link>
          ))}
        </div>
      </nav>

      {snapshot.status === 'empty' ? (
        <section className="mt-12 border-4 border-border bg-card p-6 md:p-10" aria-live="polite">
          <p className="font-pixel text-[13px] leading-7 text-primary">Todavía no hay suficientes datos</p>
          <p className="mt-4 max-w-2xl font-mono text-[12px] normal-case leading-6 text-muted-foreground">
            La publicación queda en espera hasta contar con observaciones históricas válidas. No mostramos estimaciones ni valores de relleno.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-14" aria-labelledby="signal-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-4 border-border pb-4">
              <h2 id="signal-heading" className="font-pixel text-[13px] leading-7 text-primary md:text-[16px]">Señal de precios</h2>
              <p className="font-mono text-[10px] text-muted-foreground">
                Último dato: {snapshot.updatedAt ? formatDate(snapshot.updatedAt) : 'sin fecha'}
              </p>
            </div>
            <PriceIndexChart series={snapshot.series} />
          </section>

          <section className="mt-14" aria-labelledby="latest-heading">
            <h2 id="latest-heading" className="mb-5 font-pixel text-[13px] leading-7 text-foreground">Última lectura</h2>
            <div className="overflow-x-auto border-4 border-border bg-card">
              <table className="w-full min-w-[760px] border-collapse font-mono text-[11px]">
                <thead className="bg-muted text-left uppercase text-muted-foreground">
                  <tr>
                    {['Categoría', 'Índice', 'Precio mediano', '7 días', '30 días', '90 días', 'Productos', 'Ofertas'].map((label) => (
                      <th key={label} scope="col" className="border-b-4 border-border px-4 py-4">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.series.map((series) => {
                    const point = getLatestPoint(series);
                    if (!point) return null;
                    return (
                      <tr key={series.id} className="border-b-2 border-border last:border-b-0">
                        <th scope="row" className="px-4 py-4 text-left text-foreground">{series.label}</th>
                        <td className="px-4 py-4 text-primary">{point.index.toFixed(2)}</td>
                        <td className="px-4 py-4">{formatCurrency(point.medianPriceArs)}</td>
                        <td className="px-4 py-4">{formatVariation(series.variations.days7)}</td>
                        <td className="px-4 py-4">{formatVariation(series.variations.days30)}</td>
                        <td className="px-4 py-4">{formatVariation(series.variations.days90)}</td>
                        <td className="px-4 py-4">{point.productCount}</td>
                        <td className="px-4 py-4">{point.offerCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot.coverage && (
            <section className="mt-12 border-y-4 border-border py-6 font-mono" aria-labelledby="coverage-heading">
              <h2 id="coverage-heading" className="text-[11px] uppercase text-secondary">Cobertura de la última lectura</h2>
              <p className="mt-3 text-[12px] normal-case leading-6 text-foreground">
                {snapshot.coverage.productCount} productos · {snapshot.coverage.offerCount} ofertas · {snapshot.coverage.categoryCount} categorías · del {formatDate(snapshot.coverage.startDate)} al {formatDate(snapshot.coverage.endDate)}.
              </p>
            </section>
          )}
        </>
      )}

      <section id="metodologia" className="mt-14 scroll-mt-28" aria-labelledby="method-heading">
        <h2 id="method-heading" className="font-pixel text-[13px] leading-7 text-primary md:text-[16px]">Metodología</h2>
        <div className="mt-6 grid gap-8 border-4 border-border bg-card p-6 font-mono text-[12px] normal-case leading-7 text-foreground md:grid-cols-2 md:p-8">
          <div>
            <h3 className="mb-3 text-[11px] font-bold uppercase text-secondary">Cómo se calcula</h3>
            <p>
              Para cada día reconstruimos la última cotización conocida de cada oferta que sigue vigente y tenía stock. Elegimos el menor precio por producto y luego calculamos la mediana de esos productos dentro de cada categoría. Cada serie arranca en 100.
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-[11px] font-bold uppercase text-accent">Límites de la muestra</h3>
            <p>
              Existe sesgo de supervivencia: una oferta que ya no está vigente queda fuera de toda la reconstrucción. El historial registra cambios, no capturas completas, y conserva como máximo 365 días. Los resultados describen esta muestra y pueden cambiar con su cobertura.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-12 font-mono text-[10px] normal-case leading-6 text-muted-foreground">
        <p>Datos agregados, sin identificadores de productos, tiendas ni enlaces individuales.</p>
        <Link href="/contacto" className="mt-2 inline-block text-secondary underline decoration-2 underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ring">
          Consultas sobre la metodología
        </Link>
      </footer>
    </main>
  );
}

export default async function HardwarePriceIndexPage() {
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;
  const snapshot = await getHardwarePriceIndex(90);
  return <PriceIndexPageContent snapshot={snapshot} nonce={nonce} />;
}
