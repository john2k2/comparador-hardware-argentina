'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { decodeObservedHome, type ObservedHomeSnapshot } from '@/lib/home/observed-snapshot';
import { ProductGrid } from '@/components/functional/ProductGrid';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { SectionTitle } from './SectionTitle';

const Context = createContext<{ data: ObservedHomeSnapshot | null; pending: boolean; failed: boolean }>({ data: null, pending: true, failed: false });
export function ObservedHomeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ data: null as ObservedHomeSnapshot | null, pending: true, failed: false });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/home/observed-sections', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('No hay un corte válido.');
        const data = decodeObservedHome({ kind: 'public-home', data: await response.json() });
        if (!data) throw new Error('No hay un corte válido.');
        if (!controller.signal.aborted) setState({ data, pending: false, failed: false });
      } catch {
        if (!controller.signal.aborted) setState({ data: null, pending: false, failed: true });
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function ObservedLatestOffers() {
  const { data, pending, failed } = useContext(Context);
  return <section id="ultimas-ofertas" aria-label="Últimas ofertas" className="scroll-mt-24">
    <SectionTitle title="ÚLTIMAS OFERTAS" subtitle="Una selección de distintas categorías y modelos, con precios y stock relevados en las últimas 3 horas." actionHref="/search?sortBy=newest" actionLabel="Ver catálogo" />
    {pending ? <ProductGridSkeleton count={4} /> : <ProductGrid products={data?.latestOfferProducts ?? []} compact surface="home_latest_offers" emptyMessage={failed ? 'No pudimos cargar una selección reciente. Podés explorar el catálogo o volver más tarde.' : 'No hay ofertas recientes verificadas en este corte. Podés explorar el catálogo.'} />}
    {data && <p className="font-body text-sm text-muted-foreground mt-3">Selección consultada el {new Date(data.collectedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} · hora de Argentina. Las fechas de cada oferta se conservan; comprobá las condiciones en la tienda.</p>}
  </section>;
}
export function ObservedPriceDrops() {
  const { data, pending } = useContext(Context);
  if (pending) return <ProductGridSkeleton count={4} />;
  if (!data || data.priceDropFallbackUsed || !data.priceDropProducts.length) return null;
  return <><SectionTitle title="BAJARON DE PRECIO" subtitle="Bajas registradas en el historial de las 24 horas anteriores a la lectura de esta selección." actionHref="/search?sortBy=price-asc" actionLabel="MAS BARATOS" /><ProductGrid products={data.priceDropProducts} compact surface="home_price_drop" /></>;
}
