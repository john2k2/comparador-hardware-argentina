'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ANALYTICS_READY_EVENT } from '@/lib/analytics/consent';
import { trackEnebaPromotionClick, trackEnebaPromotionView } from '@/lib/eneba/analytics';
import { ENEBA_REVIEWED_GAMES } from '@/lib/eneba/pilot';

// La portada del sitio es un documento estático: muestra la selección revisada sin precios
// para no consultar el feed por visita. Los precios vigentes están en /juegos-digitales.
const HIGHLIGHT_IDS = [
  'steam-shinobi-art-of-vengeance-digital-deluxe-edition-steam-key-pc-latam',
  'steam-planet-coaster-2-deluxe-edition-steam-key-pc-latam',
  'epic-games-chivalry-ii-epic-games-key-latam',
  'steam-trine-2-complete-story-steam-key-pc-latam',
];
const HIGHLIGHTS = HIGHLIGHT_IDS.flatMap((id) => ENEBA_REVIEWED_GAMES.filter((game) => game.id === id));

export function EnebaPromotion() {
  const element = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    const recordView = () => { if (visible) trackEnebaPromotionView(); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      recordView();
    }, { threshold: 0.5 });
    observer.observe(element.current);
    window.addEventListener(ANALYTICS_READY_EVENT, recordView);
    return () => {
      observer.disconnect();
      window.removeEventListener(ANALYTICS_READY_EVENT, recordView);
    };
  }, []);

  return (
    <aside ref={element} aria-label="Juegos para PC en Eneba"
      className="mb-8 border-4 border-secondary bg-card p-4 md:p-6 pixel-shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 border-2 border-secondary bg-secondary px-2 py-1 font-mono text-xs font-bold uppercase text-secondary-foreground">
          <span aria-hidden="true" className="motion-safe:animate-pixel-blink">▶</span> Nuevo · Juegos para PC
        </p>
        <span className="font-mono text-xs font-bold uppercase text-accent">Publicidad · Enlaces afiliados</span>
      </div>

      <h2 className="mt-4 font-pixel text-sm leading-loose text-foreground md:text-lg">
        {ENEBA_REVIEWED_GAMES.length} juegos de Steam y Epic en Eneba
      </h2>
      <p className="mt-2 max-w-[72ch] font-mono text-sm leading-relaxed text-foreground">
        Claves digitales que se activan en Argentina, con plataforma, región e idioma revisados. Mirá precios y condiciones antes de comprar.
      </p>

      <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {HIGHLIGHTS.map((game) => (
          <li key={game.id} className="min-w-0">
            <Link href="/juegos-digitales" prefetch={false} onClick={trackEnebaPromotionClick} tabIndex={-1} aria-hidden="true"
              className="group flex h-full flex-col border-2 border-border bg-background transition-colors hover:border-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={game.coverUrl} alt="" width={300} height={300} loading="lazy" decoding="async"
                referrerPolicy="no-referrer" className="aspect-square w-full border-b-2 border-border object-cover" />
              <span className="flex flex-1 flex-col gap-1 p-2">
                <span className="line-clamp-2 font-mono text-xs font-bold leading-snug text-foreground group-hover:text-secondary">{game.name}</span>
                <span className="mt-auto font-mono text-xs text-muted-foreground">{game.platform}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="font-mono text-xs leading-relaxed text-foreground/85">
          Podemos recibir una comisión por compras realizadas desde nuestros enlaces.
        </p>
        <Link href="/juegos-digitales" prefetch={false} onClick={trackEnebaPromotionClick}
          className="pixel-button inline-flex min-h-12 shrink-0 items-center justify-center px-4 py-3 text-center font-mono! text-base font-bold leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary">
          Ver juegos y condiciones →
        </Link>
      </div>
    </aside>
  );
}
