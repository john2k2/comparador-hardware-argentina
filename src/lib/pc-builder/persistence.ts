import type { Product } from '@/lib/types';
import { formatPriceARS } from '@/lib/price-utils';
import { BUILDER_BUDGET_MAX, BUILDER_BUDGET_MIN } from '@/lib/seo/budget-query';
import { BUILD_SLOTS, SLOT_LABELS, type BuildDraft, type BuildSlot } from './types';
import { quoteBuild } from './model';

export const BUILD_STORAGE_KEY = 'comparador:pc-build:v1';
export function trimBuildShipping(draft: BuildDraft): BuildDraft {
  const stores = new Set(Object.values(draft.selections).map((selection) => selection.storeId));
  return { ...draft, shipping: Object.fromEntries(Object.entries(draft.shipping).filter(([id]) => stores.has(id))) };
}
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function parseBuildDraft(input: unknown): BuildDraft | null {
  if (!record(input) || input.version !== 1 || !Number.isInteger(input.budget) || Number(input.budget) < BUILDER_BUDGET_MIN || Number(input.budget) > BUILDER_BUDGET_MAX
    || !['cash', 'installments'].includes(String(input.payment)) || !record(input.selections) || !record(input.shipping)) return null;
  const selections: BuildDraft['selections'] = {};
  for (const [key, value] of Object.entries(input.selections)) {
    if (!BUILD_SLOTS.includes(key as BuildSlot) || !record(value) || !text(value.productId, 240) || !text(value.storeId, 80) || !text(value.url, 2048)
      || !Number.isInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > (key === 'ram' || key === 'ssd' ? 4 : 1)) return null;
    try { const url = new URL(value.url); if (url.protocol !== 'https:' || url.username || url.password) return null; } catch { return null; }
    selections[key as BuildSlot] = { productId: value.productId, storeId: value.storeId, url: value.url, quantity: Number(value.quantity) };
  }
  const shipping: Record<string, number> = {};
  if (Object.keys(input.shipping).length > 8) return null;
  for (const [key, value] of Object.entries(input.shipping)) {
    if (!text(key, 80) || ['__proto__', 'constructor', 'prototype'].includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2_000_000) return null;
    shipping[key] = Math.round(value * 100) / 100;
  }
  return { version: 1, budget: Number(input.budget), payment: input.payment as BuildDraft['payment'], selections, shipping };
}
export function encodeBuild(draft: BuildDraft): string {
  return btoa(Array.from(new TextEncoder().encode(JSON.stringify(trimBuildShipping(draft))), (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBuild(encoded: string): BuildDraft | null {
  if (encoded.length > 32_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try { return parseBuildDraft(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))))); } catch { return null; }
}

export function createBuildShareUrl(draft: BuildDraft, origin: string): string {
  const url = new URL('/guia/armar', origin);
  url.searchParams.set('pesos', String(draft.budget));
  url.hash = `pc=${encodeBuild(draft)}`;
  return url.href;
}

export function createWhatsAppShareUrl(draft: BuildDraft, origin: string): string {
  const text = `Mi armado de PC — presupuesto objetivo ${formatPriceARS(draft.budget)}.\nAbrí el enlace para ver las piezas, los precios disponibles y las comprobaciones pendientes.\n${createBuildShareUrl(draft, origin)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
export function exportBuildText(draft: BuildDraft, products: Product[], now = new Date()): string {
  const quote = quoteBuild(draft, products, now.getTime());
  return [
    'PRESUPUESTO DE PC — Comparador Hardware Argentina',
    `Preparado: ${now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`,
    `Estado: ${quote.complete && !quote.unquoted ? 'selección completa; confirmar condiciones en cada tienda' : 'armado incompleto / ofertas por confirmar'}`,
    `Modalidad: ${draft.payment === 'cash' ? 'precio de contado publicado' : 'total de cuotas informadas por cada comercio'}`,
    ...quote.lines.map((line) => `${SLOT_LABELS[line.slot]}: ${line.product?.name ?? 'Producto no disponible'} × ${line.selection.quantity}\n  ${line.subtotal === null ? `Pendiente de precio reciente o cotización válida${line.referenceSubtotal === null ? '' : ` (último importe ${formatPriceARS(line.referenceSubtotal)}, orientativo)`}` : formatPriceARS(line.subtotal)} — ${line.offer?.storeName ?? 'Oferta no disponible'}\n  Fecha de oferta: ${line.offer && new Date(line.offer.lastUpdated).getTime() > 0 ? new Date(line.offer.lastUpdated).toLocaleString('es-AR') : 'desconocida'}\n  ${line.offer?.url ?? ''}`),
    `Subtotal con precios recientes: ${formatPriceARS(quote.subtotal)}`,
    ...(quote.referenceSubtotal > quote.subtotal ? [`Estimación orientativa de todas las piezas, incluidos precios anteriores: ${formatPriceARS(quote.referenceSubtotal)} (no confirmada)`] : []),
    `Envíos ingresados por el usuario: ${formatPriceARS(quote.shipping)}${quote.missingShipping.length ? ' (faltan envíos por cotizar)' : ''}`,
    `Total calculado${quote.unquoted || !quote.complete || quote.missingShipping.length ? ' parcial, no confirmado' : ''}: ${quote.unquoted && quote.subtotal === 0 ? 'pendiente' : formatPriceARS(quote.total)}`,
    `Presupuesto objetivo: ${formatPriceARS(draft.budget)}`,
    ...quote.issues.map((issue) => `- ${issue.message}`),
    'Precios sujetos a condiciones de la tienda. No incluye armado, sistema operativo ni periféricos. Confirmar stock, pago, envío y compatibilidad antes de comprar.',
  ].join('\n\n');
}
