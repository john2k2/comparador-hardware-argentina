'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { HardwareCategory, Product } from '@/lib/types';
import { COMPARABLE_CATEGORIES, COMPARISON_USE_CASES, compareProducts, type ComparisonUseCase } from '@/lib/comparison/dynamic-comparison';
import { formatPriceARS } from '@/lib/price-utils';
import { isCompleteComputerTitle } from '@/lib/product-identity';
import { AdvisoryCta } from '@/components/commercial/AdvisoryCta';
import { OfferReportLink } from '@/components/commercial/OfferReportLink';
import { CATALOG_OFFER_FRESH_MS, OFFER_FRESH_MS } from '@/lib/price-freshness';

type Side = 'left' | 'right';

function ProductFinder({ category, side, selected, onSelect }: {
  category: HardwareCategory;
  side: Side;
  selected: Product | null;
  onSelect: (product: Product | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  function changeQuery(value: string) {
    requestRef.current?.abort();
    setQuery(value);
    setProducts([]);
    setLoading(false);
  }

  async function search() {
    requestRef.current?.abort();
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/products?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Product request failed: ${response.status}`);
      const payload = await response.json() as { products?: Product[] };
      if (!controller.signal.aborted) {
        setProducts((payload.products ?? []).filter((product) => product.category === category
          && (category === 'computadoras' || !isCompleteComputerTitle(product.name))).slice(0, 5));
      }
    } catch {
      if (!controller.signal.aborted) setProducts([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="border-2 border-border p-4 bg-background">
      <h2 className="text-[12px] font-bold text-primary mb-3">{side === 'left' ? 'PRODUCTO A' : 'PRODUCTO B'}</h2>
      {selected ? (
        <div>
          <p className="text-[12px] font-bold leading-relaxed">{selected.name}</p>
          <p className="text-[12px] text-muted-foreground mt-2">Último precio registrado: {selected.lowestPrice > 0 ? formatPriceARS(selected.lowestPrice) : 'sin precio'}</p>
          <button type="button" aria-label={`Cambiar producto ${side === 'left' ? 'A' : 'B'}`} onClick={() => {
            requestRef.current?.abort();
            setQuery('');
            setProducts([]);
            setLoading(false);
            onSelect(null);
          }} className="mt-3 min-h-10 border-2 border-border px-3 text-[12px] font-bold hover:border-primary">CAMBIAR</button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void search(); }}
              placeholder="Ej: Ryzen 5 5600"
              aria-label={`Buscar ${side === 'left' ? 'producto A' : 'producto B'}`}
              className="min-w-0 flex-1 border-2 border-border bg-card px-3 py-3 text-[12px] font-mono focus:border-primary focus:outline-none"
            />
            <button type="button" onClick={() => void search()} className="border-2 border-primary bg-primary px-3 text-[12px] font-bold text-primary-foreground disabled:opacity-50" disabled={loading || query.trim().length < 2}>
              {loading ? '...' : 'BUSCAR'}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {products.map((product) => (
              <button key={product.id} type="button" onClick={() => onSelect(product)} className="w-full border-2 border-border p-3 text-left hover:border-primary">
                <span className="block text-[12px] font-bold leading-relaxed">{product.name}</span>
                <span className="mt-1 block text-[12px] text-muted-foreground">{product.prices.length} ofertas · último precio registrado {product.lowestPrice > 0 ? formatPriceARS(product.lowestPrice) : 'sin precio'}</span>
              </button>
            ))}
            {!loading && query.length >= 2 && products.length === 0 && <p className="text-[12px] text-muted-foreground">Buscá para ver productos del catálogo.</p>}
          </div>
        </>
      )}
    </section>
  );
}

export function ProductComparisonBuilder() {
  const [category, setCategory] = useState<HardwareCategory>('procesadores');
  const [useCase, setUseCase] = useState<ComparisonUseCase>('gaming');
  const [left, setLeft] = useState<Product | null>(null);
  const [right, setRight] = useState<Product | null>(null);
  const [comparisonNow, setComparisonNow] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const now = Date.now();
      setComparisonNow(now);
      // Cambiar la recomendación al vencer la evidencia, sin leer tiendas ni
      // modificar las fechas. La referencia visible tiene su vencimiento de 24 h.
      const deadlines = [...(left?.prices ?? []), ...(right?.prices ?? [])]
        .flatMap(offer => [OFFER_FRESH_MS, CATALOG_OFFER_FRESH_MS]
          .map(windowMs => new Date(offer.lastUpdated).getTime() + windowMs + 1))
        .filter(deadline => Number.isFinite(deadline) && deadline > now);
      if (deadlines.length) timer = setTimeout(update, Math.min(Math.min(...deadlines) - now, CATALOG_OFFER_FRESH_MS));
    };
    update();
    window.addEventListener('focus', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); };
  }, [left, right]);
  const comparison = useMemo(() => comparisonNow > 0 && left && right && left.category === category && right.category === category
    ? compareProducts(left, right, useCase, comparisonNow) : null, [left, right, useCase, category, comparisonNow]);

  return (
    <div>
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="comparison-category" className="mb-2 block text-[12px] font-bold text-muted-foreground">TIPO DE COMPONENTE</label>
          <select id="comparison-category" value={category} onChange={(event) => {
            setLeft(null);
            setRight(null);
            setCategory(event.target.value as HardwareCategory);
          }} className="w-full border-2 border-border bg-background px-3 py-3 text-[12px] font-bold focus:border-primary focus:outline-none">
            {COMPARABLE_CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="comparison-use-case" className="mb-2 block text-[12px] font-bold text-muted-foreground">¿PARA QUÉ LO VAS A USAR?</label>
          <select id="comparison-use-case" value={useCase} onChange={(event) => setUseCase(event.target.value as ComparisonUseCase)} className="w-full border-2 border-border bg-background px-3 py-3 text-[12px] font-bold focus:border-primary focus:outline-none">
            {COMPARISON_USE_CASES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
          <p className="mt-2 text-[12px] font-mono text-muted-foreground">{COMPARISON_USE_CASES.find((entry) => entry.id === useCase)?.description}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ProductFinder key={`${category}-left`} category={category} side="left" selected={left} onSelect={(product) => setLeft(product?.category === category ? product : null)} />
        <ProductFinder key={`${category}-right`} category={category} side="right" selected={right} onSelect={(product) => setRight(product?.category === category ? product : null)} />
      </div>

      {!comparison && <p className="mt-5 border-2 border-dashed border-border p-4 text-[12px] text-muted-foreground">Elegí dos productos para generar la comparación completa.</p>}

      {comparison && left && right && (
        <div className="mt-6 space-y-6">
          <section className="border-4 border-primary bg-primary/10 p-5 pixel-shadow">
            <h2 className="text-[12px] font-bold text-primary">[ ¿CUÁL CONVIENE? ]</h2>
            <p className="mt-3 text-[12px] font-mono leading-relaxed">{comparison.recommendation}</p>
            {comparison.difference != null && <p className="mt-2 text-[12px] font-bold">Diferencia: {formatPriceARS(comparison.difference)}{comparison.differencePercent != null ? ` (${comparison.differencePercent}%)` : ''}</p>}
            <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
              {comparison.evidence.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </section>

          <section className="border-4 border-border bg-card p-5 pixel-shadow overflow-x-auto">
            <h2 className="mb-4 text-[12px] font-bold text-primary">[ PRECIO Y ESPECIFICACIONES ]</h2>
            <table className="w-full min-w-[620px] text-[12px] font-mono">
              <thead><tr className="border-b-2 border-border"><th className="p-2 text-left">Dato</th><th className="p-2 text-left">{left.name}</th><th className="p-2 text-left">{right.name}</th></tr></thead>
              <tbody>
                <tr className="border-b border-border"><th className="p-2 text-left">Mejor precio reciente (24 h)</th><td className="p-2">{comparison.leftPrice ? formatPriceARS(comparison.leftPrice) : 'Sin precio reciente'}</td><td className="p-2">{comparison.rightPrice ? formatPriceARS(comparison.rightPrice) : 'Sin precio reciente'}</td></tr>
                <tr className="border-b border-border"><th className="p-2 text-left">Ofertas relevadas</th><td className="p-2">{left.prices.length}</td><td className="p-2">{right.prices.length}</td></tr>
                {comparison.specificationRows.map((row) => <tr key={row.label} className="border-b border-border/60"><th className="p-2 text-left">{row.label}</th><td className="p-2">{row.left}</td><td className="p-2">{row.right}</td></tr>)}
              </tbody>
            </table>
          </section>

          {(category === 'procesadores' || category === 'tarjetas-graficas') && (
            <section className="border-4 border-border bg-card p-5 pixel-shadow">
              <h2 className="mb-4 text-[12px] font-bold text-primary">[ RENDIMIENTO Y VALOR ]</h2>
              {comparison.leftBenchmark && comparison.rightBenchmark ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {([['A', comparison.leftBenchmark, comparison.leftPrice, comparison.leftMetricScore, comparison.leftPriceFresh], ['B', comparison.rightBenchmark, comparison.rightPrice, comparison.rightMetricScore, comparison.rightPriceFresh]] as const).map(([label, benchmark, price, metricScore, priceFresh]) => (
                      <div key={label} className="border-2 border-border p-4">
                        <p className="text-[12px] font-bold text-muted-foreground">PRODUCTO {label} · {benchmark.model}</p>
                        <p className="mt-2 text-[18px] font-pixel text-primary">{benchmark.primaryScore.toLocaleString('es-AR')}</p>
                        <p className="mt-1 text-[12px] font-mono">{benchmark.primaryLabel}</p>
                        {benchmark.secondaryScore != null && <p className="mt-2 text-[12px] font-mono">{benchmark.secondaryScore.toLocaleString('es-AR')} · {benchmark.secondaryLabel}</p>}
                        {priceFresh && price && metricScore != null && <p className="mt-3 text-[12px] font-bold">{(metricScore / price * 100_000).toFixed(1)} puntos de {comparison.metricLabel} por cada $100.000</p>}
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[12px] font-mono leading-relaxed text-muted-foreground">{comparison.leftBenchmark.methodology}</p>
                  <div className="mt-3 space-y-1 text-[12px] font-mono">
                    {Array.from(new Map([comparison.leftBenchmark, comparison.rightBenchmark].map((benchmark) => [benchmark.sourceUrl, benchmark])).values()).map((benchmark) => (
                      <p key={benchmark.sourceUrl}>Fuente: <a href={benchmark.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{benchmark.sourceName}</a> · consulta {benchmark.measuredAt}</p>
                    ))}
                  </div>
                </>
              ) : (
                <div className="border-2 border-dashed border-border p-4">
                  <p className="text-[12px] font-mono leading-relaxed">Todavía no tenemos un benchmark verificable para ambos modelos exactos. Mostramos precios y especificaciones, pero no declaramos rendimiento por peso.</p>
                </div>
              )}
            </section>
          )}

          <section className="border-4 border-border bg-card p-5 pixel-shadow">
            <h2 className="mb-4 text-[12px] font-bold text-primary">[ OFERTAS RELEVADAS EN LAS ÚLTIMAS 24 H ]</h2>
            <div className="grid gap-5 md:grid-cols-2">
              {([['A', left, comparison.leftOffers], ['B', right, comparison.rightOffers]] as const).map(([label, product, offers]) => (
                <div key={label}>
                  <h3 className="mb-2 text-[12px] font-bold">{label} · {product.name}</h3>
                  {offers.length === 0 ? <p className="text-[12px] text-muted-foreground">Sin ofertas recientes comparables en stock.</p> : (
                    <ul className="space-y-2 text-[12px] font-mono">
                      {offers.map((offer) => <li key={`${offer.store}-${offer.price}`} className="flex justify-between gap-3 border-b border-border pb-2"><span>{offer.store}</span><strong>{formatPriceARS(offer.price)}</strong></li>)}
                    </ul>
                  )}
                  <OfferReportLink context={{ productId: product.id, productName: product.name }} />
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-muted-foreground">Las tiendas aparecen acá como fuente del precio relevado. La página no les concede una ubicación promocional.</p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href={`/product/${encodeURIComponent(left.id)}?from=/comparativa/comparar`} className="border-2 border-border p-3 text-center text-[12px] font-bold hover:border-primary">VER PRECIOS DE A</Link>
            <Link href={`/product/${encodeURIComponent(right.id)}?from=/comparativa/comparar`} className="border-2 border-border p-3 text-center text-[12px] font-bold hover:border-primary">VER PRECIOS DE B</Link>
          </div>

          <AdvisoryCta surface="product_comparison" />
        </div>
      )}

      {!comparison && <div className="mt-6"><AdvisoryCta surface="product_comparison" compact /></div>}
    </div>
  );
}
