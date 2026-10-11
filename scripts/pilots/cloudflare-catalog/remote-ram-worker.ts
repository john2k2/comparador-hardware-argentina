// El piloto revalida la prueba fabricante con el mismo gate del consumidor.
import { createRemoteWorker } from './remote-worker.mjs';
import { isComparableStoreOffer } from '@/lib/price-utils';
import { readIdentityReview, readSourceIdentity } from '@/lib/quality/offer-identity';

export function verifyAdmittedRamOffer(raw: Record<string, unknown>, product: Record<string, unknown>): boolean {
  if(typeof raw.price!=='number'||typeof raw.store_id!=='string'||typeof raw.url!=='string'||typeof product.name!=='string'
    ||product.category!=='memoria-ram'||typeof raw.stock!=='string')return false;
  const sourceIdentity=readSourceIdentity(raw.source_identity),identityReview=readIdentityReview(raw.identity_review);
  if(!sourceIdentity||!identityReview||identityReview.status!=='consistent'||identityReview.proof?.version!==2)return false;
  return isComparableStoreOffer({price:raw.price,storeId:raw.store_id,url:raw.url,stock:raw.stock,
    sourceIdentity,identityReview},
  product as {name:string;category:string;specs?:Record<string,string>});
}
export default createRemoteWorker({ramVerifier:verifyAdmittedRamOffer});
