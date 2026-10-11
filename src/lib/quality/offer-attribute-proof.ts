import { extractGpuBoardAttributes, normalizeIdentityText, parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';
import { exactSsdAttributes } from './storage-identity';
import { exactRamAttributes } from './ram-identity';
import { captureRamSpecs, planRamEnrichment, type RamSubject } from './ram-enrichment';
import { listingReference } from '@/lib/scrapers/listing-reference';
import type { OfferSourceIdentity } from '@/lib/types';

export type ManufacturerRamProof = { version: 2; method: 'manufacturer-ram'; mpn: string;
  target: { title: string; sku: string; specs: Record<string, string | number> };
  source: { title: string; sku: string; specs: Record<string, string | number> };
  binding: { storeId: 'compragamer'; url: string; listingRef: string }; attributes: Record<string, string> };
export type OfferAttributeProof = { version: 1; method: 'exact-attributes'; attributes: Record<string, string> } | ManufacturerRamProof;
type ProofContext = { targetSpecs?: Record<string, unknown>; sourceIdentity?: OfferSourceIdentity; url?: string };
function stableJson(value: unknown): string {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`
    : JSON.stringify(value) ?? 'undefined';
}

/** Los títulos siguen siendo originales; el enriquecimiento tiene un método separado. */
export function proveManufacturerRamAttributes(target: RamSubject, source: RamSubject,
  binding: { storeId: string; url: string; listingRef: string }): ManufacturerRamProof | null {
  if (binding.storeId !== 'compragamer' || listingReference(binding.storeId, binding.url) !== binding.listingRef
    || typeof target.title !== 'string' || typeof source.title !== 'string' || target.title.length > 400 || source.title.length > 400
    || typeof target.sku !== 'string' || typeof source.sku !== 'string') return null;
  const targetSpecs = captureRamSpecs(target.specs), sourceSpecs = captureRamSpecs(source.specs);
  if (!targetSpecs || !sourceSpecs || targetSpecs.SKU !== target.sku || sourceSpecs.SKU !== source.sku) return null;
  const capturedTarget = { title: target.title, sku: target.sku, specs: targetSpecs };
  const capturedSource = { title: source.title, sku: source.sku, specs: sourceSpecs };
  const plan = planRamEnrichment({ manufacturerMpn: target.sku, target: capturedTarget, source: capturedSource });
  if (!plan.ok) return null;
  return { version: 2, method: 'manufacturer-ram', mpn: plan.mpn, target: capturedTarget, source: capturedSource,
    binding: { storeId: 'compragamer', url: binding.url, listingRef: binding.listingRef }, attributes: plan.target.attributes };
}

export function cpuVariantAttributes(name: string): Record<string, string> {
  const text=normalizeIdentityText(name);
  const excluded=/\b(?:sin|no|s) (?:cooler|disipador)\b|\bno incluye (?:cooler|disipador)\b/.test(text);
  const included=/\b(?:con|c) (?:cooler|disipador)\b|\b(?:cooler|disipador) incluid[oa]\b|\bwraith (?:stealth|spire|prism)\b/.test(text);
  return {
    packaging:[...new Set(text.match(/\b(box|tray|oem)\b/g)??[])].sort().join('-'),
    cooler:excluded&&included?'conflict':excluded?'excluded':included?'included':'',
    condition:/\boutlet\b/.test(text)?'outlet':/\b(usado|used)\b/.test(text)?'used':/\b(reacondicionado|refurbished)\b/.test(text)?'refurbished':'',
  };
}

/** Omisiones y coincidencias aproximadas requieren revisión; nunca se inventa un score. */
export function exactOfferAttributes(name: string, category: string): Record<string, string> | null {
  const text = normalizeIdentityText(name);
  if (category !== 'memoria-ram' && /\b(combo|pc gamer|computadora|notebook|laptop|bundle)\b/.test(text)) return null;
  if (category === 'procesadores') {
    const chip = parseCpuModelSignature(name);
    if (!chip || chip.family === 'unknown' || chip.family === 'ryzen') return null;
    const variant=cpuVariantAttributes(name);
    if(variant.cooler==='conflict') return null;
    return { family: chip.family, model: chip.number, suffixes: chip.suffixes.join('-'), ...variant };
  }
  if (category === 'tarjetas-graficas') {
    const chip = parseGpuChipSignature(name), board = extractGpuBoardAttributes(name);
    const memory = text.match(/\b(?:o)?(\d{1,2})\s*gb\b/)?.[1];
    if (!chip || !board.brand || !board.series || !memory) return null;
    return { family: chip.family, model: chip.number, suffixes: chip.suffixes.join('-'), memory,
      ...Object.fromEntries(Object.entries(board).map(([key, value]) => [key, value ?? ''])) };
  }
  if (category === 'memoria-ram') return exactRamAttributes(name);
  if (category === 'almacenamiento') return exactSsdAttributes(name);
  return null;
}

export function proveOfferAttributes(name: string, category: string, sourceTitle: string): OfferAttributeProof | null {
  const target = exactOfferAttributes(name, category), source = exactOfferAttributes(sourceTitle, category);
  if (!target || !source || JSON.stringify(target) !== JSON.stringify(source)) return null;
  return { version: 1, method: 'exact-attributes', attributes: target };
}

export function attributeProofMatches(proof: OfferAttributeProof | undefined, name: string, category: string, title: string, context?: ProofContext): boolean {
  if (proof?.version === 2 && proof.method === 'manufacturer-ram') {
    if (category !== 'memoria-ram' || !context?.targetSpecs || !context.sourceIdentity || !context.url
      || !proof.target || !proof.source || !proof.binding || !proof.attributes
      || typeof proof.target.title !== 'string' || typeof proof.source.title !== 'string'
      || normalizeIdentityText(proof.target.title) !== normalizeIdentityText(name)
      || proof.source.title !== title || context.sourceIdentity.title !== title
      || context.targetSpecs.SKU !== proof.mpn || context.sourceIdentity.storeSku !== proof.mpn
      || proof.target.sku !== proof.mpn || proof.source.sku !== proof.mpn
      || proof.binding.url !== context.url || proof.binding.listingRef !== context.sourceIdentity.listingRef) return false;
    if (context.sourceIdentity.sourceId !== undefined && context.sourceIdentity.sourceId !== proof.binding.listingRef.split(':').at(-1)) return false;
    const expected = proveManufacturerRamAttributes(proof.target, proof.source, proof.binding);
    const current = proveManufacturerRamAttributes({ title: name, sku: String(context.targetSpecs.SKU), specs: context.targetSpecs },
      proof.source, proof.binding);
    return Boolean(expected && current && stableJson(expected) === stableJson(proof)
      && JSON.stringify(current.attributes) === JSON.stringify(expected.attributes));
  }
  const expected = proveOfferAttributes(name, category, title);
  if (!expected || !proof || proof.version !== 1 || proof.method !== 'exact-attributes' || !proof.attributes) return false;
  const keys = Object.keys(expected.attributes);
  return keys.length === Object.keys(proof.attributes).length && keys.every(key => proof.attributes[key] === expected.attributes[key]);
}
