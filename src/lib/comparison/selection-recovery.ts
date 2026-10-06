import type { HardwareCategory, Product } from '@/lib/types';
import { normalizeFetchedProduct } from '@/lib/product/product-cache-utils';
import { COMPARABLE_CATEGORIES, COMPARISON_USE_CASES, type ComparisonUseCase } from './dynamic-comparison';

export const COMPARISON_SELECTION_KEY = 'comparison-selection:v1';
export const COMPARISON_SELECTION_TTL_MS = 2 * 60 * 60 * 1000;
export type ComparisonSelection = {
  category: HardwareCategory;
  useCase: ComparisonUseCase;
  leftId: string | null;
  rightId: string | null;
};

function validId(id: unknown): boolean {
  return id === null || (typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(id));
}
function validSelection(value: Record<string, unknown>): boolean {
  return COMPARABLE_CATEGORIES.some((category) => category.id === value.category)
    && COMPARISON_USE_CASES.some((useCase) => useCase.id === value.useCase)
    && validId(value.leftId) && validId(value.rightId);
}

// Persistimos contexto e IDs; ningún dato de una oferta viaja en el snapshot.
export function encodeComparisonSelection(selection: ComparisonSelection, now = Date.now()): string | null {
  if (!validSelection(selection) || !Number.isFinite(now) || now <= 0) return null;
  return JSON.stringify({ version: 1, savedAt: now, category: selection.category,
    useCase: selection.useCase, leftId: selection.leftId, rightId: selection.rightId });
}

export function decodeComparisonSelection(raw: string | null, now = Date.now()): ComparisonSelection | null {
  if (!raw || raw.length > 2_000 || !Number.isFinite(now) || now <= 0) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || Array.isArray(value) || typeof value !== 'object' || value.version !== 1
      || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt) || value.savedAt <= 0
      || value.savedAt > now + 60_000 || now - value.savedAt > COMPARISON_SELECTION_TTL_MS
      || !validSelection(value)) return null;
    return { category: value.category as HardwareCategory, useCase: value.useCase as ComparisonUseCase,
      leftId: value.leftId as string | null, rightId: value.rightId as string | null };
  } catch { return null; }
}

export function recoverComparisonProduct(payload: unknown, id: string, category: HardwareCategory): Product | null {
  if (!payload || typeof payload !== 'object') return null;
  const product = payload as Product;
  if (product.id !== id || product.category !== category || typeof product.name !== 'string' || !product.name.trim()
    || !Array.isArray(product.prices) || product.prices.some((offer) => !offer || typeof offer !== 'object')
    || !product.specs || typeof product.specs !== 'object' || Array.isArray(product.specs)) return null;
  // La hidratación convierte fechas; no las renueva ni concede stock o frescura.
  return normalizeFetchedProduct(product);
}
