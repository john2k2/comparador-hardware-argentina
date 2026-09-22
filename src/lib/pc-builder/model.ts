import type { Product, ProductPrice } from '@/lib/types';
import { buildIdentityEvidence, hasExplicitIdentityConflict, needsIdentityReview } from '@/lib/quality/offer-identity';
import { isBundleLikeTitle, isCompleteComputerTitle } from '@/lib/product-identity';
import { getComparableStorePrices } from '@/lib/price-utils';
import { buildBudgetFromCatalog } from '@/lib/seo/budget-builder';
import { checkBuildCompatibility, hasIntegratedGraphics, includesCpuCooler, spec } from './compatibility';
import { BUILD_SLOTS, SLOT_CATEGORIES, SLOT_LABELS, emptyBuild, type BuildDraft, type BuildLine, type BuildQuote, type BuildSelection, type BuildSlot } from './types';

export const OFFER_FRESH_MS = 3 * 60 * 60 * 1000;
export function eligibleOffers(product: Product): ProductPrice[] {
  return getComparableStorePrices(product.prices.filter((offer) => {
    if (!Number.isFinite(offer.price) || offer.price <= 0 || needsIdentityReview(offer, product)) return false;
    const evidence = buildIdentityEvidence(product.name, product.category, offer.url);
    if (evidence && hasExplicitIdentityConflict(evidence)) return false;
    if (offer.stock !== 'in-stock' && offer.stock !== 'low-stock') return false;
    try { const url = new URL(offer.url); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
  }));
}
function fitsSlot(product: Product, slot: BuildSlot): boolean {
  const name = product.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Una categoría del comercio no basta: estos accesorios no reemplazan al componente.
  const processorAccessory = /\b(?:thermal[ -]?pads?|pads? termicos?|pasta termica|heatsinks?|heat[ -]sinks?|contact[ -]?frame|back[ -]?plate|watercool(?:er|ing)?|waterblock|refrigeracion liquida)\b/.test(name)
    || /^(?:\w+\s+)?(?:disipador|cooler|refrigeracion)\b/.test(name);
  const graphicsAccessory = /\b(?:riser|waterblock|back[ -]?plate|soporte (?:para )?(?:gpu|placa)|gpu holder)\b/.test(name);
  return product.category === SLOT_CATEGORIES[slot]
    && !isCompleteComputerTitle(product.name)
    && (slot === 'ram' || !isBundleLikeTitle(product.name))
    && !/\b(usado|refurbished|reacondicionado|outlet|notebook|laptop)\b/i.test(product.name)
    && (slot !== 'cooler' || !/\b(gabinete|fan|ventilador|pasta)\b/i.test(product.name))
    && (slot !== 'cooler' || !/^(?:micro|procesador|amd\s+ryzen|intel\s+(?:core|i[3579]))\b/i.test(product.name.trim()))
    && (slot !== 'cpu' || !processorAccessory)
    && (slot !== 'gpu' || !graphicsAccessory)
    && (slot !== 'ssd' || !/\b(externo|externa|external|portable|portatil|usb[ -]?c)\b/i.test(product.name));
}
export function candidatesForSlot(products: Product[], slot: BuildSlot): Product[] {
  return products.filter((product) => fitsSlot(product, slot) && eligibleOffers(product).length > 0)
    .sort((a, b) => eligibleOffers(a)[0].price - eligibleOffers(b)[0].price);
}
export function selectProduct(product: Product, offer = eligibleOffers(product)[0]): BuildSelection | undefined {
  return offer ? { productId: product.id, storeId: offer.storeId, url: offer.url, quantity: 1 } : undefined;
}
export function suggestBuild(products: Product[], budget: number): BuildDraft {
  const draft = emptyBuild(budget);
  const eligibleProducts = BUILD_SLOTS.flatMap((slot) => candidatesForSlot(products, slot));
  const built = buildBudgetFromCatalog({ budget, products: eligibleProducts, preferComplete: true });
  for (const [slot, component] of Object.entries(built.slots)) {
    const product = products.find((item) => item.id === component.productId);
    const selection = product && selectProduct(product);
    if (selection) draft.selections[slot as BuildSlot] = selection;
  }
  const cpu = products.find((product) => product.id === draft.selections.cpu?.productId);
  const motherboard = products.find((product) => product.id === draft.selections.motherboard?.productId);
  const chassis = products.find((product) => product.id === draft.selections.case?.productId);
  if (cpu && includesCpuCooler(cpu) !== true) {
    const cooler = candidatesForSlot(products, 'cooler').find((product) =>
      Boolean(spec(product, 'sockets compatibles', 'socket', 'compatibilidad'))
      && !checkBuildCompatibility({ cpu, motherboard, case: chassis, cooler: product }, draft)
        .some((issue) => ['cooler-socket', 'cooler-height'].includes(issue.code) && issue.severity === 'error')
      && built.total + eligibleOffers(product)[0].price <= budget);
    if (cooler) draft.selections.cooler = selectProduct(cooler);
  }
  return draft;
}
export function quoteBuild(draft: BuildDraft, products: Product[], now = Date.now()): BuildQuote {
  const parts: Partial<Record<BuildSlot, Product>> = {};
  const lines: BuildLine[] = [];
  const issues: BuildQuote['issues'] = [];
  for (const slot of BUILD_SLOTS) {
    const selection = draft.selections[slot];
    if (!selection) continue;
    const product = products.find((item) => item.id === selection.productId && fitsSlot(item, slot)) ?? null;
    const offer = product?.prices.find((price) => price.storeId === selection.storeId && price.url === selection.url) ?? null;
    if (product) parts[slot] = slot === 'cpu' && offer ? { ...product, prices: [offer] } : product;
    const eligible = product && offer && eligibleOffers(product).includes(offer);
    const unit = draft.payment === 'installments' ? offer?.installment?.totalAmount : offer?.price;
    const unitPrice = eligible && typeof unit === 'number' && Number.isFinite(unit) && unit > 0 ? unit : null;
    lines.push({ slot, product, offer, selection, unitPrice, subtotal: unitPrice === null ? null : Math.round(unitPrice * selection.quantity * 100) / 100 });
    if (unitPrice === null) issues.push({ code: `offer-${slot}`, severity: 'error', message: `${SLOT_LABELS[slot]}: la oferta elegida no tiene precio y stock utilizables para esta forma de pago. Elegí otra o actualizala.` });
    const observedAt = offer ? new Date(offer.lastUpdated).getTime() : NaN;
    if (!Number.isFinite(observedAt) || observedAt > now + 60_000 || now - observedAt > OFFER_FRESH_MS) issues.push({ code: `stale-${slot}`, severity: 'warning', message: `${SLOT_LABELS[slot]}: precio pendiente de actualización; conservamos la fecha de la tienda.` });
  }
  const required: BuildSlot[] = ['cpu', 'motherboard', 'ram', 'ssd', 'psu', 'case'];
  if (!hasIntegratedGraphics(parts.cpu)) required.push('gpu');
  for (const slot of required) if (!parts[slot]) issues.push({ code: `missing-${slot}`, severity: 'error', message: `Falta elegir ${SLOT_LABELS[slot].toLowerCase()}.` });
  issues.push(...checkBuildCompatibility(parts, draft));
  const storeIds = [...new Set(lines.filter((line) => line.offer).map((line) => line.selection.storeId))];
  const missingShipping = storeIds.filter((storeId) => draft.shipping[storeId] === undefined);
  const shipping = Math.round(storeIds.reduce((sum, id) => sum + (draft.shipping[id] ?? 0), 0) * 100) / 100;
  const subtotal = Math.round(lines.reduce((sum, line) => sum + (line.subtotal ?? 0), 0) * 100) / 100;
  const total = Math.round((subtotal + shipping) * 100) / 100;
  const unquoted = lines.filter((line) => line.subtotal === null).length;
  return { lines, issues, subtotal, shipping, total, unquoted, missingShipping, storeIds,
    complete: required.every((slot) => parts[slot]) && (Boolean(parts.cooler) || includesCpuCooler(parts.cpu) === true)
      && !issues.some((issue) => issue.severity === 'error'),
    overBudget: Math.max(0, Math.round((total - draft.budget) * 100) / 100) };
}
