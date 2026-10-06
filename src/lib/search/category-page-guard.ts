import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import type { HardwareCategory, Product } from '@/lib/types';

/** El total/paginación SQL se conserva: no inventar una cuenta global a partir
 * de una página. Se señalan las filas apartadas hasta reparar el inventario. */
export function guardCategoryPage(products: Product[], category?: HardwareCategory) {
  const visible: Product[] = [];
  let excluded = 0;
  for (const product of products) {
    const observedCategory = inferHardwareCategoryFromName(product.name);
    if (category && observedCategory && observedCategory !== category) {
      excluded += 1;
      continue;
    }
    visible.push(observedCategory && observedCategory !== product.category
      ? { ...product, category: observedCategory } : product);
  }
  return { products: visible, excluded };
}
