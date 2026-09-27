'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ANALYTICS_CONSENT_EVENT, ANALYTICS_CONSENT_KEY, parseAnalyticsChoice } from '@/lib/analytics/consent';

function readChoice() {
  try { return parseAnalyticsChoice(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)); }
  catch { return null; }
}

function subscribeChoice(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

const needsChoice = () => !readChoice();
const serverNeedsChoice = () => false;

function removeAnalyticsCookies() {
  const domains = window.location.hostname.split('.');
  const suffixes = domains.map((_, index) => domains.slice(index).join('.'));
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (!/^_ga(?:_|$)/.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (const domain of suffixes) document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
  }
}

export function AnalyticsPreferences() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [chosenThisVisit, setChosenThisVisit] = useState(false);
  const choiceNeeded = useSyncExternalStore(subscribeChoice, needsChoice, serverNeedsChoice);

  useEffect(() => {
    const show = () => { setSaved(false); setOpen(true); };
    const sync = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_KEY && event.key !== null) return;
      const choice = readChoice();
      const wasAllowed = window.__chaAnalyticsAllowed;
      window.__chaApplyAnalyticsChoice?.(choice?.allowed === true);
      if (wasAllowed && !choice?.allowed) { removeAnalyticsCookies(); window.location.reload(); }
      setOpen(!choice);
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, show);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, show);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function choose(allowed: boolean) {
    const wasAllowed = window.__chaAnalyticsAllowed;
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ allowed, savedAt: Date.now() }));
      setTemporary(false);
    } catch { setTemporary(true); }
    window.__chaApplyAnalyticsChoice?.(allowed);
    if (!allowed) removeAnalyticsCookies();
    if (wasAllowed && !allowed) { window.location.reload(); return; }
    setChosenThisVisit(true);
    setOpen(true);
    setSaved(true);
  }

  if (!open && (!choiceNeeded || chosenThisVisit)) return null;
  return (
    <aside aria-label="Preferencias de privacidad" className="fixed bottom-0 inset-x-0 z-50 border-t-2 border-border bg-card p-4 md:p-6 max-h-[70dvh] overflow-y-auto">
      <div className="mx-auto max-w-5xl flex flex-col md:flex-row gap-4 md:items-center">
        <div className="flex-1 text-sm leading-relaxed">
          <h2 className="font-bold mb-2">Tu elección de privacidad</h2>
          {saved ? (
            <p role="status">Preferencia guardada{temporary ? ' para esta visita; el navegador no permitió guardarla para futuras visitas' : ' por hasta 180 días'}. Podés cambiarla desde el pie de página.</p>
          ) : (
            <p>Usamos almacenamiento necesario para funciones del sitio. Si aceptás, Google Analytics mide visitas y clics para mejorar el comparador. Podés rechazarlo y seguir usando todo. <Link href="/privacidad" className="underline underline-offset-4">Cómo tratamos tus datos</Link>.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {saved ? <button type="button" className="pixel-button min-h-11" onClick={() => setOpen(false)}>Cerrar preferencias</button> : <>
            <button type="button" className="pixel-button min-h-11" onClick={() => choose(false)}>Rechazar analítica</button>
            <button type="button" className="pixel-button min-h-11" onClick={() => choose(true)}>Aceptar analítica</button>
          </>}
        </div>
      </div>
    </aside>
  );
}

export function AnalyticsPreferencesButton() {
  if (!process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID) return null;
  return <button type="button" className="min-h-11 text-left hover:text-primary underline underline-offset-4" onClick={() => window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT))}>Preferencias de privacidad</button>;
}
