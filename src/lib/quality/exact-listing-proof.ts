import { normalizeIdentityText } from '@/lib/product-identity';
import { listingReference } from '@/lib/scrapers/listing-reference';
import type { OfferSourceIdentity } from '@/lib/types';

export const exactListingCategories = ['motherboards','gabinetes','fuentes-alimentacion','refrigeracion','perifericos'] as const;
export type ExactListingSubject = { title: string; category: string; sku: string };
export type ExactListingProof = { version: 3; method: 'exact-listing';
  target: ExactListingSubject; source: ExactListingSubject;
  binding: { storeId: 'compragamer'; url: string; listingRef: string; sourceId: string } };
const excluded = /\b(combo|kit|bundle|paquete|outlet|usado|used|bulk|oem|reacondicionado|refurbished|pc|computadora|notebook|laptop)\b|\+/i;
const sku = (value: unknown): string | null => typeof value === 'string' && value.trim().length > 0
  && value.length <= 160 && !/[\x00-\x1f]/.test(value) ? value.trim() : null;
function valid(subject: ExactListingSubject): boolean {
  return Boolean(subject && !Array.isArray(subject) && exactListingCategories.includes(subject.category as typeof exactListingCategories[number])
    && typeof subject.title === 'string' && subject.title.trim() && subject.title.length <= 400
    && !excluded.test(subject.title) && sku(subject.sku));
}
/** Acredita la publicación existente con su título completo y código observado.
 * El SKU no se declara MPN; no acredita compatibilidad ni permite agrupar fichas.
 */
export function proveExactListing(target: ExactListingSubject, source: ExactListingSubject,
  binding: { storeId: string; url: string; listingRef: string; sourceId: string }): ExactListingProof | null {
  if (!valid(target) || !valid(source) || target.category !== source.category
    || normalizeIdentityText(target.title) !== normalizeIdentityText(source.title) || sku(target.sku) !== sku(source.sku)
    || binding?.storeId !== 'compragamer' || typeof binding.sourceId !== 'string' || !/^[1-9]\d{0,14}$/.test(binding.sourceId)
    || binding.listingRef !== `compragamer:id:${binding.sourceId}`
    || listingReference(binding.storeId,binding.url) !== binding.listingRef) return null;
  return { version: 3, method: 'exact-listing', target: {title:target.title,category:target.category,sku:sku(target.sku)!},
    source: {title:source.title,category:source.category,sku:sku(source.sku)!},
    binding: {storeId:'compragamer',url:binding.url,listingRef:binding.listingRef,sourceId:binding.sourceId} };
}
function stable(value: unknown): string {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? `{${Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable((value as Record<string,unknown>)[key])).join(',')}}`
    : JSON.stringify(value) ?? 'undefined';
}
export function exactListingProofMatches(proof: ExactListingProof,
  current: { name: string; category: string; specs?: Record<string,unknown> },
  source: OfferSourceIdentity | undefined, url: string | undefined): boolean {
  if (!valid(proof?.target) || !valid(proof?.source) || !proof.binding || !source || !url
    || typeof current?.name !== 'string' || typeof current.category !== 'string'
    || source.purchaseRestriction !== undefined || source.title !== proof.source.title
    || source.sourceId !== proof.binding.sourceId || source.listingRef !== proof.binding.listingRef
    || sku(source.storeSku) !== proof.source.sku || proof.binding.url !== url
    || current.category !== proof.target.category || normalizeIdentityText(current.name) !== normalizeIdentityText(proof.target.title)
    || sku(current.specs?.SKU) !== proof.target.sku) return false;
  const expected=proveExactListing(proof.target,proof.source,proof.binding);
  return Boolean(expected && stable(expected)===stable(proof));
}
