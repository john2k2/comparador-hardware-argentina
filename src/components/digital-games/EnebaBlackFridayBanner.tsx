'use client';

import { useEffect, useState } from 'react';
import { trackEnebaBlackFridayClick } from '@/lib/eneba/analytics';
import { ENEBA_BLACK_FRIDAY, ENEBA_BLACK_FRIDAY_URL, isEnebaBlackFridayActive } from '@/lib/eneba/black-friday';

const endsLabel = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
}).format(new Date(ENEBA_BLACK_FRIDAY.endsAt));

// La portada es un documento estático: la vigencia se decide con el reloj del navegador,
// así el banner desaparece solo al vencer aunque el HTML no se vuelva a generar.
export function EnebaBlackFridayBanner({ surface }: { surface: 'home' | 'digital_games' }) {
  const [active, setActive] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const update = () => setActive(isEnebaBlackFridayActive(Date.now()));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!active) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(ENEBA_BLACK_FRIDAY.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside aria-label="Black Friday en Eneba" className="mb-6 border-4 border-primary bg-card p-4 md:p-5 pixel-shadow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-pixel text-xs leading-loose text-primary md:text-sm">Black Friday en Eneba</p>
        <span className="font-mono text-xs font-bold uppercase text-accent">Publicidad · Enlace afiliado</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Descuentos con el código">
        {ENEBA_BLACK_FRIDAY.discounts.map((discount) => (
          <li key={discount.label} className="border-2 border-border bg-background px-2 py-1 font-mono text-xs text-foreground">
            {discount.label} <strong className="text-secondary">-{discount.value}</strong>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={copyCode}
            className="border-2 border-dashed border-primary bg-background px-3 py-2 font-mono text-base font-bold tracking-widest text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary">
            {ENEBA_BLACK_FRIDAY.code}
          </button>
          <span className="font-mono text-xs text-muted-foreground" aria-live="polite">
            {copied ? 'Código copiado' : `Un uso por usuario · vence el ${endsLabel}`}
          </span>
        </div>
        <a href={ENEBA_BLACK_FRIDAY_URL} target="_blank" rel="sponsored nofollow noopener" onClick={() => trackEnebaBlackFridayClick(surface)}
          className="pixel-button inline-flex min-h-12 shrink-0 items-center justify-center px-4 py-3 text-center font-mono! text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary">
          Usar el código en Eneba →
        </a>
      </div>
      <p className="mt-3 font-mono text-xs leading-relaxed text-foreground/85">
        Revisá en Eneba la región y la plataforma de cada clave antes de pagar. Podemos recibir una comisión por compras desde este enlace.
      </p>
    </aside>
  );
}
