'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '@/lib/types';
import { formatPriceARS } from '@/lib/price-utils';
import { parseBuilderBudgetPesos, BUILDER_BUDGET_MIN, BUILDER_BUDGET_MAX } from '@/lib/seo/budget-query';
import { BUILD_SLOTS, SLOT_LABELS, emptyBuild, type BuildDraft, type BuildSlot } from '@/lib/pc-builder/types';
import { candidatesForSlot, eligibleOffers, quoteBuild, selectProduct, suggestBuild } from '@/lib/pc-builder/model';
import { BUILD_STORAGE_KEY, createBuildShareUrl, createWhatsAppShareUrl, decodeBuild, exportBuildText, parseBuildDraft, trimBuildShipping } from '@/lib/pc-builder/persistence';
import { fetchBuilderProducts, mergeCatalog } from '@/lib/pc-builder/client';
import { trackBudgetBuilder, trackPcBuilderAction, trackStoreClick, type PcBuilderAction } from '@/lib/analytics/ga4';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { AdvisoryCta } from '@/components/commercial/AdvisoryCta';
import { RefreshOffersButton } from './RefreshOffersButton';

const control = 'min-h-11 w-full min-w-0 border-2 border-border bg-background px-3 py-2 font-body text-sm focus:outline-2 focus:outline-secondary';
const button = 'min-h-11 border-2 border-border bg-card px-3 py-2 font-body text-sm font-bold hover:border-secondary disabled:opacity-50';
function observedLabel(product: Product | undefined, storeId: string | undefined, url: string | undefined): string {
  const price = product?.prices.find((item) => item.storeId === storeId && item.url === url);
  const date = price ? new Date(price.lastUpdated) : null;
  return date && Number.isFinite(date.getTime()) && date.getTime() > 0
    ? date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : 'fecha no informada';
}
export function PcBuilder({ initialBudget, invalidBudget = false }: { initialBudget: number | null; invalidBudget?: boolean }) {
  const [draft, setDraft] = useState<BuildDraft>(() => emptyBuild(initialBudget ?? 1_500_000));
  const [budgetInput, setBudgetInput] = useState(String(initialBudget ?? 1_500_000));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(invalidBudget ? `Usá un presupuesto entre ${formatPriceARS(BUILDER_BUDGET_MIN)} y ${formatPriceARS(BUILDER_BUDGET_MAX)}.` : '');
  const [saved, setSaved] = useState<BuildDraft | null>(null);
  const [queries, setQueries] = useState<Partial<Record<BuildSlot, string>>>({});
  const [searching, setSearching] = useState<BuildSlot | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [sharedDraft, setSharedDraft] = useState<BuildDraft | null>(null);
  const [shareOrigin, setShareOrigin] = useState('');
  const quote = useMemo(() => quoteBuild(draft, products), [draft, products]);
  const componentCount = Object.keys(draft.selections).length;
  const whatsappUrl = shareOrigin && componentCount ? createWhatsAppShareUrl(draft, shareOrigin) : '';

  function trackAction(action: PcBuilderAction, extra: { slot?: string; status?: string; updatedCount?: number } = {}, currentDraft = draft, catalog = products) {
    const currentQuote = quoteBuild(currentDraft, catalog);
    trackPcBuilderAction({ action, componentCount: Object.keys(currentDraft.selections).length,
      complete: currentQuote.complete && currentQuote.unquoted === 0 && currentQuote.missingShipping.length === 0, ...extra });
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      let collected: Product[] = []; const failures: string[] = [];
      for (let index = 0; index < BUILD_SLOTS.length; index += 2) {
        await Promise.all(BUILD_SLOTS.slice(index, index + 2).map(async (slot) => {
          try { const incoming = await fetchBuilderProducts({ slot }, controller.signal); collected = mergeCatalog(collected, incoming); }
          catch { if (!controller.signal.aborted) failures.push(SLOT_LABELS[slot]); }
        }));
      }
      if (controller.signal.aborted) return;
      let restored: BuildDraft | null = null;
      const hash = new URLSearchParams(window.location.hash.slice(1)).get('pc');
      if (hash) { restored = decodeBuild(hash); if (!restored) failures.push('el enlace compartido no es válido'); }
      try { const raw = localStorage.getItem(BUILD_STORAGE_KEY); if (raw) setSaved(parseBuildDraft(JSON.parse(raw))); } catch { /* El navegador puede bloquear el almacenamiento. */ }
      if (restored) {
        try { const ids = Object.values(restored.selections).map((item) => item.productId); if (ids.length) collected = mergeCatalog(collected.filter((product) => !ids.includes(product.id)), await fetchBuilderProducts({ ids }, controller.signal)); }
        catch { failures.push('algunas piezas del enlace'); }
        if (controller.signal.aborted) return;
        setDraft(restored); setBudgetInput(String(restored.budget));
        const restoredQuote = quoteBuild(restored, collected);
        trackPcBuilderAction({ action: 'shared_opened', componentCount: Object.keys(restored.selections).length,
          complete: restoredQuote.complete && restoredQuote.unquoted === 0 && restoredQuote.missingShipping.length === 0 });
      } else if (initialBudget && !hash) {
        setDraft(suggestBuild(collected, initialBudget));
        trackBudgetBuilder({ source: 'preset', budget: initialBudget });
      }
      setShareOrigin(window.location.origin);
      setProducts(collected); setLoading(false);
      if (failures.length) setNotice(`No se pudo cargar: ${failures.join(', ')}. Podés buscar las piezas o volver a cargar la página.`);
    }
    void load();
    return () => controller.abort();
  }, [initialBudget]);

  function choose(slot: BuildSlot, id: string) {
    const product = products.find((item) => item.id === id);
    const selections = { ...draft.selections };
    const selection = product && selectProduct(product);
    if (selection) selections[slot] = selection; else delete selections[slot];
    const nextDraft = trimBuildShipping({ ...draft, selections });
    setDraft(nextDraft);
    setShareUrl('');
    trackAction('component_selected', { slot }, nextDraft);
  }
  async function search(slot: BuildSlot) {
    setSearching(slot); setNotice('');
    try { const found = await fetchBuilderProducts({ slot, query: queries[slot] }); setProducts((current) => mergeCatalog(current, found)); if (!found.length) setNotice(`No encontramos coincidencias para ${SLOT_LABELS[slot].toLowerCase()}. Probá otro modelo.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo buscar.'); }
    finally { setSearching(null); }
  }
  async function reloadSelection() {
    const ids = Object.values(draft.selections).map((item) => item.productId);
    if (!ids.length) return;
    const refreshed = await fetchBuilderProducts({ ids });
    setProducts((current) => mergeCatalog(current.filter((product) => !ids.includes(product.id)), refreshed));
  }
  function save() {
    try { const savedDraft = trimBuildShipping(draft); localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(savedDraft)); setSaved(savedDraft); setNotice('Armado guardado en este navegador.'); trackAction('saved'); }
    catch { setNotice('Este navegador no permite guardar. Podés compartir el enlace o descargar el presupuesto.'); }
  }
  async function restore() {
    if (!saved) return;
    setDraft(saved); setBudgetInput(String(saved.budget)); setShareUrl('');
    try { const ids = Object.values(saved.selections).map((item) => item.productId); const loaded = ids.length ? await fetchBuilderProducts({ ids }) : []; setProducts((current) => mergeCatalog(current.filter((product) => !ids.includes(product.id)), loaded)); setNotice('Armado recuperado. Los precios se leen del catálogo actual.'); trackAction('restored', {}, saved, loaded); }
    catch { setNotice('Recuperamos tu selección, pero no pudimos consultar sus precios. Volvé a cargar las ofertas.'); trackAction('restored', { status: 'catalog_unavailable' }, saved, []); }
  }
  async function share() {
    const url = createBuildShareUrl(draft, window.location.origin); setShareUrl(url); setSharedDraft(draft);
    trackAction('share_link');
    try { await navigator.clipboard.writeText(url); setNotice('Enlace copiado. Comparte las piezas elegidas; los precios se consultan al abrirlo.'); }
    catch { setNotice('Copiá el enlace que aparece debajo.'); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([exportBuildText(draft, products)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'presupuesto-pc.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    trackAction('download');
  }
  return <main className="container mx-auto px-4 py-8 max-w-7xl" data-testid="pc-builder">
    <nav className="font-body text-sm mb-6"><Link href="/guia" className="underline">Guías</Link> / Armá tu PC</nav>
    <header className="mb-6 max-w-3xl"><h1 className="font-pixel text-base md:text-xl text-primary leading-relaxed">Armá tu PC gamer con un presupuesto</h1>
      <p className="font-body text-base mt-3">Elegí cada pieza, compará tiendas y llevate un presupuesto con las comprobaciones pendientes a la vista.</p></header>
    <form className="border-4 border-border bg-card p-4 md:p-5 mb-6 flex flex-wrap gap-4 items-end" onSubmit={(event) => {
      event.preventDefault(); const budget = parseBuilderBudgetPesos(budgetInput);
      if (!budget) { setNotice(`Usá un presupuesto entre ${formatPriceARS(BUILDER_BUDGET_MIN)} y ${formatPriceARS(BUILDER_BUDGET_MAX)}.`); return; }
      setDraft(suggestBuild(products, budget)); setShareUrl(''); setNotice('Sugerencia generada con las ofertas del catálogo. Revisá las piezas faltantes y las advertencias.');
      trackBudgetBuilder({ source: 'manual', budget });
    }}>
      <label className="flex-1 min-w-48 font-body text-sm">Presupuesto en pesos argentinos<input className={`${control} mt-1`} name="pesos" inputMode="numeric" value={budgetInput} onChange={(event) => {
        setBudgetInput(event.target.value); const budget = parseBuilderBudgetPesos(event.target.value); if (budget) setDraft((current) => ({ ...current, budget }));
      }} /></label>
      <button className="pixel-button text-xs" disabled={loading} type="submit">{loading ? 'Cargando catálogo…' : 'Armar PC'}</button>
      <button className={button} type="button" onClick={() => { const empty = emptyBuild(draft.budget); setDraft(empty); setShareUrl(''); trackAction('reset', {}, empty); }}>Empezar de cero</button>
    </form>
    {notice && <p role="status" className="border-l-4 border-accent bg-card p-3 mb-5 font-body text-sm">{notice}</p>}
    <div className="grid lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)] gap-6 items-start">
      <section aria-label="Componentes de tu PC" className="space-y-4 min-w-0">
        {BUILD_SLOTS.map((slot) => {
          const selection = draft.selections[slot], selected = products.find((product) => product.id === selection?.productId);
          const candidates = candidatesForSlot(products, slot).filter((product) => !queries[slot] || product.name.toLowerCase().includes(queries[slot]!.toLowerCase()));
          const offers = selected ? eligibleOffers(selected) : [];
          const selectedOffer = offers.find((offer) => offer.storeId === selection?.storeId && offer.url === selection.url);
          const recordedOffer = selected?.prices.find((offer) => offer.storeId === selection?.storeId && offer.url === selection.url);
          const reviewPending = Boolean(recordedOffer && selected && needsIdentityReview(recordedOffer, selected));
          return <article key={slot} className="border-4 border-border bg-card p-4 min-w-0" data-slot={slot}>
            <div className="flex justify-between gap-3 items-start"><h2 className="font-pixel text-xs text-secondary leading-relaxed">{SLOT_LABELS[slot]}</h2>
              {selection && <button className="font-body text-xs underline min-h-8" onClick={() => choose(slot, '')} aria-label={`Quitar ${SLOT_LABELS[slot]}`}>Quitar</button>}</div>
            {slot === 'cooler' && <p className="font-body text-xs text-muted-foreground mt-1">Necesaria si la CPU no incluye un disipador adecuado.</p>}
            <div className="flex gap-2 mt-3"><input aria-label={`Buscar ${SLOT_LABELS[slot]}`} className={control} placeholder="Buscar por modelo" value={queries[slot] ?? ''} onChange={(event) => setQueries((current) => ({ ...current, [slot]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(slot); } }} />
              <button type="button" className={button} onClick={() => void search(slot)} disabled={loading || searching !== null}>Buscar</button></div>
            <label className="block font-body text-xs mt-3">Componente<select aria-label={`Elegir ${SLOT_LABELS[slot]}`} className={`${control} mt-1`} value={selection?.productId ?? ''} onChange={(event) => choose(slot, event.target.value)} disabled={loading}>
              <option value="">{loading ? 'Cargando…' : 'Elegí una pieza'}</option>
              {selection && !candidates.some((product) => product.id === selection.productId) && <option value={selection.productId}>{selected?.name ?? 'Pieza guardada no disponible'} — selección actual</option>}
              {candidates.map((product) => <option key={product.id} value={product.id}>{product.name} — desde {formatPriceARS(eligibleOffers(product)[0].price)}</option>)}
            </select></label>
            {!loading && !candidates.length && <p className="font-body text-xs mt-2">No hay ofertas aptas en esta selección. Probá buscar otro modelo.</p>}
            {selection && <>
              <label className="block font-body text-xs mt-3">Oferta de tienda<select aria-label={`Tienda para ${SLOT_LABELS[slot]}`} className={`${control} mt-1`} value={JSON.stringify([selection.storeId, selection.url])} onChange={(event) => {
                const [storeId, url] = JSON.parse(event.target.value) as string[];
                const nextDraft = trimBuildShipping({ ...draft, selections: { ...draft.selections, [slot]: { ...selection, storeId, url } } });
                setDraft(nextDraft);
                trackAction('offer_selected', { slot }, nextDraft);
              }}>
                {!selectedOffer && <option value={JSON.stringify([selection.storeId, selection.url])}>{reviewPending ? 'Modelo pendiente de revisión' : 'Oferta anterior — pendiente de confirmar'}</option>}
                {offers.map((offer) => <option key={offer.url} value={JSON.stringify([offer.storeId, offer.url])}>{offer.storeName} — {formatPriceARS(offer.price)} contado{offer.installment ? ` / ${offer.installment.count} cuotas, total ${formatPriceARS(offer.installment.totalAmount)}` : ''}</option>)}
              </select></label>
              {reviewPending && <p className="font-body text-sm border-l-4 border-accent pl-3 mt-3">La coincidencia del modelo requiere revisión. Conservamos el precio y la fecha informados, pero esta oferta no entra al total. Podés elegir otra tienda.</p>}
              <div className="flex flex-wrap items-center gap-4 mt-3 font-body text-xs">
                {(slot === 'ram' || slot === 'ssd') && <label>Cantidad {slot === 'ram' ? 'de kits / unidades' : 'de unidades'}<select aria-label={`Cantidad de ${SLOT_LABELS[slot]}`} className="border-2 border-border bg-background min-h-11 ml-2 px-2" value={selection.quantity} onChange={(event) => setDraft((current) => ({ ...current, selections: { ...current.selections, [slot]: { ...selection, quantity: Number(event.target.value) } } }))}>{[1, 2, 3, 4].map((quantity) => <option key={quantity}>{quantity}</option>)}</select></label>}
                {selectedOffer && selected && <a className="underline min-h-11 inline-flex items-center" href={selectedOffer.url} target="_blank" rel="noopener noreferrer" onClick={() => trackStoreClick({
                  productId: selected.id, productName: selected.name, category: selected.category,
                  storeId: selectedOffer.storeId, storeName: selectedOffer.storeName, price: selectedOffer.price,
                  position: offers.indexOf(selectedOffer) + 1, ctaId: 'builder_store_offer', destinationUrl: selectedOffer.url,
                  surface: 'budget_builder', linkType: 'organic',
                })}>Ir a la tienda ↗</a>}
                <p>Precio relevado: {observedLabel(selected, selection.storeId, selection.url)}</p>
              </div>
            </>}
          </article>;
        })}
      </section>
      <aside className="space-y-5 min-w-0 lg:sticky lg:top-5">
        <section className="border-4 border-secondary bg-card p-5 pixel-shadow" aria-label="Resumen del presupuesto">
          <h2 className="font-pixel text-sm text-secondary">Tu presupuesto</h2>
          <label className="block font-body text-sm mt-4">Forma de pago<select className={`${control} mt-1`} value={draft.payment} onChange={(event) => setDraft((current) => ({ ...current, payment: event.target.value as BuildDraft['payment'] }))}><option value="cash">Contado publicado por la tienda</option><option value="installments">Total de las cuotas informadas</option></select></label>
          <dl className="font-body text-sm mt-5 space-y-2"><div className="flex justify-between gap-2"><dt>Piezas cotizadas</dt><dd>{formatPriceARS(quote.subtotal)}</dd></div><div className="flex justify-between gap-2"><dt>Envíos ingresados</dt><dd>{formatPriceARS(quote.shipping)}</dd></div></dl>
          <div className="border-t-4 border-border mt-4 pt-4"><p className="font-body text-xs uppercase">{!quote.complete || quote.unquoted || quote.missingShipping.length ? 'Total parcial' : 'Total calculado'}</p><p className="font-mono text-3xl font-bold text-secondary mt-1" data-testid="build-total">{formatPriceARS(quote.total)}</p>
            <p className="font-body text-sm mt-2">{quote.overBudget ? `${formatPriceARS(quote.overBudget)} por encima de tu presupuesto.` : `${formatPriceARS(draft.budget - quote.total)} de margen sobre lo cotizado.`}</p></div>
          <p className="font-body text-xs mt-3 text-muted-foreground">{quote.missingShipping.length ? 'Faltan envíos por cotizar. ' : ''}{quote.unquoted ? `${quote.unquoted} piezas sin cotización válida. ` : ''}No incluye armado, sistema operativo ni periféricos.</p>
          {quote.storeIds.length > 0 && <fieldset className="mt-4 border-t-2 border-border pt-3"><legend className="font-body text-sm font-bold">Envío por tienda</legend>{quote.storeIds.map((storeId) => <label key={storeId} className="block font-body text-xs mt-2">{quote.lines.find((line) => line.selection.storeId === storeId)?.offer?.storeName ?? storeId}<input className={`${control} mt-1`} type="number" min="0" max="2000000" step="0.01" placeholder="Pendiente de cotizar" value={draft.shipping[storeId] ?? ''} onChange={(event) => {
            const raw = event.target.value; const amount = Number(raw); if (raw && (!Number.isFinite(amount) || amount < 0 || amount > 2_000_000)) return;
            setDraft((current) => { const shipping = { ...current.shipping }; if (raw === '') delete shipping[storeId]; else shipping[storeId] = amount; return { ...current, shipping }; });
          }} /></label>)}<p className="font-body text-xs mt-2">Ingresá el costo informado por el comercio, o 0 si confirmaste retiro o envío gratis.</p></fieldset>}
          <div className="mt-5"><RefreshOffersButton key={JSON.stringify(draft.selections)} targets={quote.lines.map((line) => ({ productId: line.selection.productId, storeId: line.selection.storeId, url: line.selection.url }))} onUpdated={reloadSelection}
            onActivity={(action, status, updatedCount) => trackAction(action, { status, updatedCount })} /></div>
        </section>
        <section className="border-4 border-border bg-card p-4"><h2 className="font-pixel text-xs mb-3">Compatibilidad y pendientes</h2>
          <p className="font-body text-sm mb-3">{quote.issues.some((issue) => issue.severity === 'error') ? 'Revisá estas piezas antes de comprar.' : 'Sin incompatibilidades detectadas en los datos disponibles. Confirmá los puntos pendientes.'}</p>
          <ul className="space-y-3 font-body text-sm">{quote.issues.map((issue) => <li key={issue.code} className={`border-l-4 pl-3 ${issue.severity === 'error' ? 'border-primary' : 'border-accent'}`}>{issue.message}</li>)}</ul>
        </section>
        <section className="border-4 border-border bg-card p-4" aria-label="Guardar presupuesto">
          <h2 className="font-pixel text-xs mb-3">Compartí tu armado</h2>
          <p className="font-body text-sm mb-3">Sin crear una cuenta. Quien abra el enlace verá las piezas elegidas y los precios disponibles en ese momento.</p>
          {whatsappUrl && <a className={`${button} mb-2 flex items-center justify-center text-center border-secondary`} href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackAction('share_whatsapp')}>Compartir por WhatsApp ↗</a>}
          <div className="grid grid-cols-2 gap-2"><button className={button} disabled={loading || !componentCount} onClick={save}>Guardar armado</button><button className={button} disabled={loading || !componentCount} onClick={() => void share()}>Copiar enlace</button><button className={button} disabled={loading || !componentCount} onClick={download}>Descargar presupuesto</button><button className={button} disabled={!saved || loading} onClick={() => void restore()}>Recuperar guardado</button></div>
          <p className="font-body text-xs text-muted-foreground mt-3">Guardar conserva un armado en este navegador. El enlace y la descarga te permiten llevarlo a otro dispositivo.</p>
        </section>
        {shareUrl && sharedDraft === draft && <label className="block font-body text-xs">Enlace para compartir<input className={`${control} mt-1`} readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label>}
      </aside>
    </div>
    <div className="mt-8"><AdvisoryCta surface="budget_builder" /></div>
  </main>;
}
