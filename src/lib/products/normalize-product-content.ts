import { sanitizeProduct } from '@/lib/product-sanitizer';
import type { Product } from '@/lib/types';

export function normalizeProductContent(product: Product): Product {
  const sanitized = sanitizeProduct(product);
  const normalizedDescription = sanitized.description?.trim() || sanitized.name;
  const normalizedModel = sanitized.model?.trim() || sanitized.name;

  return {
    ...sanitized,
    description: normalizedDescription,
    model: normalizedModel,
  };
}
