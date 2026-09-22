import { normalizeFetchedProduct } from '@/lib/product/product-cache-utils';
import type { Product } from '@/lib/types';
import type { BuildSlot } from './types';
export async function fetchBuilderProducts(input: { slot?: BuildSlot; ids?: string[]; query?: string }, signal?: AbortSignal): Promise<Product[]> {
  const query = new URLSearchParams();
  if (input.slot) query.set('slot', input.slot);
  if (input.query) query.set('q', input.query);
  for (const id of [...new Set(input.ids ?? [])]) query.append('id', id);
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`/api/pc-builder/catalog?${query}`, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const result = await response.json();
  if (!response.ok || !Array.isArray(result.products)) throw new Error(result.error || 'No se pudo cargar el catálogo.');
  return result.products.map((product: Product) => normalizeFetchedProduct(product));
}
export function mergeCatalog(existing: Product[], incoming: Product[]): Product[] {
  return [...new Map([...existing, ...incoming].map((product) => [product.id, product])).values()];
}
