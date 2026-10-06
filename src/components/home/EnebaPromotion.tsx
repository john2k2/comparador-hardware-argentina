'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ANALYTICS_READY_EVENT } from '@/lib/analytics/consent';
import { trackEnebaPromotionClick, trackEnebaPromotionView } from '@/lib/eneba/analytics';

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
    <aside ref={element} aria-labelledby="eneba-promotion-title" className="mb-6 border-[3px] border-border bg-card p-4 md:p-5 pixel-shadow">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 id="eneba-promotion-title" className="text-[12px] sm:text-[14px] font-bold uppercase leading-relaxed text-secondary">
              Juegos para PC en Eneba
            </h2>
            <span className="font-mono text-xs font-bold uppercase text-accent">Enlaces afiliados</span>
          </div>
          <p className="mt-2 max-w-[72ch] font-mono text-sm leading-relaxed text-foreground">
            Claves digitales para Steam y Epic Games. Revisá plataforma, región y precio final antes de comprar.
          </p>
          <p className="mt-1 font-mono text-xs leading-relaxed text-foreground/85">
            Podemos recibir una comisión por compras realizadas desde nuestros enlaces.
          </p>
        </div>
        <Link href="/juegos-digitales" prefetch={false} onClick={trackEnebaPromotionClick}
          className="pixel-button inline-flex min-h-12 shrink-0 items-center justify-center px-4 py-3 text-center font-mono! text-base font-bold leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary">
          Ver juegos y condiciones →
        </Link>
      </div>
    </aside>
  );
}
