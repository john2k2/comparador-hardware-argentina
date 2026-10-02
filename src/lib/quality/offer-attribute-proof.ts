import { extractGpuBoardAttributes, extractRamModelKey, normalizeIdentityText, parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';

export type OfferAttributeProof = { version: 1; method: 'exact-attributes'; attributes: Record<string, string> };

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
  if (category === 'memoria-ram') {
    const key = extractRamModelKey(name);
    // Kits, latencia y forma ausentes no acreditan equivalencia de módulos.
    if (!key || /(?:^|:)(?:na|unk|unknown-kit)(?:$|:)/.test(key)) return null;
    return { model: key };
  }
  return null;
}

export function proveOfferAttributes(name: string, category: string, sourceTitle: string): OfferAttributeProof | null {
  const target = exactOfferAttributes(name, category), source = exactOfferAttributes(sourceTitle, category);
  if (!target || !source || JSON.stringify(target) !== JSON.stringify(source)) return null;
  return { version: 1, method: 'exact-attributes', attributes: target };
}

export function attributeProofMatches(proof: OfferAttributeProof | undefined, name: string, category: string, title: string): boolean {
  const expected = proveOfferAttributes(name, category, title);
  if (!expected || !proof || proof.version !== 1 || proof.method !== 'exact-attributes' || !proof.attributes) return false;
  const keys = Object.keys(expected.attributes);
  return keys.length === Object.keys(proof.attributes).length && keys.every(key => proof.attributes[key] === expected.attributes[key]);
}
