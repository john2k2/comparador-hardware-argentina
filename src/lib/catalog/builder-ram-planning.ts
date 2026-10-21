import type { Product } from '@/lib/types';
import { planSampleTargets } from './priority-planning';
import type { RefreshTarget } from './on-demand/contracts';

// Referencias del armador, separadas de la demanda humana y de la muestra G02.
// Sólo se revisan publicaciones conocidas; no se reasignan variantes parecidas.
export const BUILDER_RAM_REFERENCES = [
  { id: 'cg-15522', sku: 'CMK8GX4M1E3200C16', url: 'https://compragamer.com/producto/Memoria_Corsair_DDR4_8GB_3200Mhz_Vengeance_LPX_Black_CL16_15522' },
  { id: 'cg-15558', sku: 'CMG16GX4M1E3200C16', url: 'https://compragamer.com/producto/Memoria_Corsair_DDR4_16GB_3200MHz_Vengeance_RGB_RS_Black_CL16_15558' },
  { id: 'cg-16112', sku: 'CMK16GX5M1B5600C40', url: 'https://compragamer.com/producto/Memoria_Corsair_DDR5_16GB_5600MHz_Vengeance_CL40_Intel_XMP_3_0_16112' },
] as const;

export function planBuilderRamTargets(products: Product[], now = Date.now()): { targets: RefreshTarget[]; missing: string[] } {
  const targets: RefreshTarget[] = [], missing: string[] = [];
  for (const reference of BUILDER_RAM_REFERENCES) {
    const product = products.find(item => item.id === reference.id);
    const offer = product?.prices.find(price => price.storeId === 'compragamer' && price.url === reference.url);
    if (!product || product.category !== 'memoria-ram' || product.specs.SKU !== reference.sku || !offer) {
      missing.push(reference.id); continue;
    }
    targets.push(...planSampleTargets([{ ...product, prices: [offer] }], now));
  }
  return { targets, missing };
}
