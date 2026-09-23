import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';

export const BUILD_SLOTS = ['cpu', 'motherboard', 'ram', 'gpu', 'ssd', 'psu', 'case', 'cooler'] as const;
export type BuildSlot = typeof BUILD_SLOTS[number];
export const SLOT_LABELS: Record<BuildSlot, string> = {
  cpu: 'Procesador', motherboard: 'Motherboard', ram: 'Memoria RAM', gpu: 'Placa de video',
  ssd: 'Almacenamiento', psu: 'Fuente', case: 'Gabinete', cooler: 'Refrigeración del procesador',
};
export const SLOT_CATEGORIES: Record<BuildSlot, HardwareCategory> = {
  cpu: 'procesadores', motherboard: 'motherboards', ram: 'memoria-ram', gpu: 'tarjetas-graficas',
  ssd: 'almacenamiento', psu: 'fuentes-alimentacion', case: 'gabinetes', cooler: 'refrigeracion',
};
export type BuildSelection = { productId: string; storeId: string; url: string; quantity: number };
export type BuildDraft = {
  version: 1;
  budget: number;
  payment: 'cash' | 'installments';
  selections: Partial<Record<BuildSlot, BuildSelection>>;
  shipping: Record<string, number>;
};
export type BuildIssue = { code: string; severity: 'error' | 'warning'; message: string };
export type BuildLine = {
  slot: BuildSlot; product: Product | null; offer: ProductPrice | null;
  selection: BuildSelection; unitPrice: number | null; subtotal: number | null; referenceSubtotal: number | null;
};
export type BuildQuote = {
  lines: BuildLine[]; issues: BuildIssue[]; subtotal: number; referenceSubtotal: number; shipping: number;
  total: number; unquoted: number; missingShipping: string[]; storeIds: string[];
  complete: boolean; overBudget: number;
};
export function emptyBuild(budget = 1_500_000): BuildDraft {
  return { version: 1, budget, payment: 'cash', selections: {}, shipping: {} };
}
