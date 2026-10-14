import { stores } from '@/lib/scrapers/static-data';
import { preparedProductRegistryContext } from './prepared-product';

// Los contratos conservan referencias a estas tiendas aunque otro código
// quite/reemplace elementos del array exportado.
const storeIds = stores.map(store => store.id).sort();
export function catalogStorePolicyStamp(): string {
  return JSON.stringify(preparedProductRegistryContext(storeIds));
}
