'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isEnebaOfferFresh, readEnebaSnapshot, type EnebaSnapshot } from '@/lib/eneba/pilot';
import { trackEnebaClick, trackEnebaPilotView } from '@/lib/eneba/analytics';
import { ANALYTICS_READY_EVENT } from '@/lib/analytics/consent';
import { OfferReportLink } from '@/components/commercial/OfferReportLink';

const formatDate = (value: string) => new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires',
}).format(new Date(value));
const formatPrice = (price: number) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', currencyDisplay: 'code',
}).format(price);

export function DigitalGames({ testData = false }: { testData?: boolean } = {}) {
  const [snapshot, setSnapshot] = useState<EnebaSnapshot | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const updateClock = () => setNow(Date.now());
    updateClock();
    const interval = window.setInterval(updateClock, 30_000);
    window.addEventListener('focus', updateClock);
    void fetch('/api/juegos-digitales', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const data = readEnebaSnapshot(await response.json());
        if (!data || data.status === 'disabled') throw new Error('invalid-response');
        if (!controller.signal.aborted) { setSnapshot(data); updateClock(); }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSnapshot({ status: 'error', offers: [], fetchedAt: null, feedUpdatedAt: null });
      });
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', updateClock);
    };
  }, []);

  const offers = snapshot?.offers.filter((offer) => isEnebaOfferFresh(offer, now)) ?? [];
  useEffect(() => {
    if (!snapshot || snapshot.status === 'disabled') return;
    const recordView = () => trackEnebaPilotView(snapshot.status as 'ready' | 'empty' | 'error',
      snapshot.offers.filter((offer) => isEnebaOfferFresh(offer)).length);
    recordView();
    window.addEventListener(ANALYTICS_READY_EVENT, recordView);
    return () => window.removeEventListener(ANALYTICS_READY_EVENT, recordView);
  }, [snapshot]);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-14">
      <header>
        <h1 className="font-pixel text-xl leading-loose md:text-3xl">Juegos digitales para Argentina</h1>
        {testData && <p className="mt-4 border-2 border-border bg-card p-3 font-body text-sm font-bold">Muestra sintética para pruebas · no son precios reales</p>}
        <p className="mt-4 font-mono text-sm normal-case text-secondary">Juegos para PC · selección revisada</p>
        <p className="mt-4 max-w-3xl font-mono text-sm normal-case leading-7 text-muted-foreground">
          Claves digitales de Eneba con plataforma y región revisadas. Esta selección tiene sus propias condiciones de activación.
        </p>
        <Link href="/search" className="mt-4 inline-flex min-h-11 items-center font-mono text-sm text-secondary underline underline-offset-4">Buscar componentes de hardware</Link>
      </header>

      <aside aria-label="Aviso de afiliación" className="mt-8 border-2 border-secondary bg-card p-5 font-mono text-sm normal-case leading-7">
        <p className="font-bold text-secondary">ENLACES AFILIADOS</p>
        <p>Si comprás desde estos enlaces, Comparador Hardware Argentina puede recibir una comisión de Eneba. El precio final puede incluir cargos según el medio de pago: confirmalo en la tienda.</p>
      </aside>

      <section aria-label="Selección de juegos" aria-live="polite" className="mt-8">
        {!snapshot ? <p role="status" className="font-mono text-sm">Consultando la muestra de precios…</p> : offers.length === 0 ? (
          <div role="status" className="border-4 border-border bg-card p-6 font-mono text-sm normal-case leading-7">
            <p className="font-bold">Precios sin verificar</p>
            <p>La muestra no tiene precios recientes con todas las condiciones verificadas. Esto no significa que los juegos estén agotados. Volvé más tarde.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {offers.map((offer, index) => (
              <article key={offer.id} className="flex min-w-0 flex-col border-4 border-border bg-card p-5 font-mono text-sm normal-case leading-7">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={offer.coverUrl} alt={`Portada de ${offer.name}`} width={300} height={300} loading="lazy" decoding="async"
                  referrerPolicy="no-referrer" className="mb-4 aspect-square w-full border-2 border-border object-cover" />
                <p className="text-xs font-bold uppercase text-secondary">{offer.platform} · Argentina</p>
                <h2 className="mt-3 font-pixel text-sm leading-7">{offer.name}</h2>
                <p className="mt-3">{offer.edition}</p>
                <p className="mt-2 text-muted-foreground">{offer.restrictions}</p>
                <p className="mt-3 text-xs text-muted-foreground">Activación en Argentina revisada el <time dateTime={offer.reviewedAt}>{formatDate(offer.reviewedAt)} (hora argentina)</time>.</p>
                <div className="mt-5 border-t-2 border-border pt-4">
                  <p className="text-xs text-muted-foreground">Desde, según el feed de Eneba</p>
                  <p className="mt-1 text-xl font-bold text-primary">{formatPrice(offer.price)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Feed actualizado: <time dateTime={offer.observedAt}>{formatDate(offer.observedAt)} (hora argentina)</time>.</p>
                </div>
                {/* Evento propio del piloto; los clics genéricos de GA4 no se suman a éste. */}
                <a id={`eneba-game-${offer.id}`} href={offer.url} target="_blank" rel="sponsored nofollow noopener noreferrer"
                  onClick={(event) => {
                    if (!isEnebaOfferFresh(offer)) { event.preventDefault(); event.stopPropagation(); setNow(Date.now()); return; }
                    trackEnebaClick(offer, index + 1);
                  }}
                  className="mt-5 flex min-h-11 items-center justify-center border-2 border-border bg-primary px-3 py-3 text-center font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  Ver {offer.name} en Eneba ↗
                </a>
                <p className="mt-2 text-center text-xs font-bold text-secondary">ENLACE AFILIADO · abre otra pestaña</p>
                <OfferReportLink className="mt-1 self-start" context={{ productName: `${offer.name} · ${offer.edition}`,
                  storeName: 'Eneba', offerUrl: offer.url }} />
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="mt-8 font-mono text-xs normal-case leading-6 text-muted-foreground">
        Los precios son una observación del feed, pueden cambiar y se ocultan después de seis horas. Confirmá vendedor, precio final, plataforma, edición y región en Eneba antes de comprar. Mostramos únicamente fichas con una revisión de activación de hasta siete días.
      </p>
    </main>
  );
}
