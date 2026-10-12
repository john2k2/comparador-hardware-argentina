import { normalizeIdentityText } from '@/lib/product-identity';
import { exactRamAttributes } from './ram-identity';
import { createBoundedIdentityTextMemo } from '@/lib/identity-text-memo';

type RamField = 'capacity' | 'kit' | 'generation' | 'speed' | 'latency' | 'form' | 'color' | 'series' | 'lighting';
type RamFacts = Record<Exclude<RamField, 'lighting'>, string> & { lighting?: 'rgb' | 'non-rgb' };
type ManufacturerRamEvidence = { mpn: string; brand: 'Corsair' | 'KLEVV'; url: string; checkedAt: string;
  facts: RamFacts; fieldUrls?: Partial<Record<RamField, string>> };
const checkedAt = '2026-10-11';
const klevvOrdering = 'https://www.klevv.com/kjp/products_details/memory/Klevv_BoltV';
const klevvSheet = 'https://www.klevv.com/HyAdmin/upload/goodFile/KLEVV_Product%20Sheet_MEMORY_BOLT%20V_v8_EN.pdf?2026010501=';
const corsairFaq = 'https://help.corsair.com/hc/en-us/articles/34383413781777-RAM-FAQ';

/** Registro público revisado, sin HTTP en runtime ni interpretación del código MPN. */
export const manufacturerRamEvidence: Readonly<Record<string, ManufacturerRamEvidence>> = {
  'KD5AGUA80-60B280H': { mpn: 'KD5AGUA80-60B280H', brand: 'KLEVV', checkedAt: '2026-10-12', url: klevvOrdering,
    facts: { capacity: '32', kit: '2x16', generation: 'ddr5', speed: '6000', latency: '28',
      form: 'dimm', color: 'grey', series: 'base' }, fieldUrls: { form: klevvSheet, color: klevvSheet } },
  'KD5AGUA80-60A300I': { mpn: 'KD5AGUA80-60A300I', brand: 'KLEVV', checkedAt: '2026-10-12', url: klevvOrdering,
    facts: { capacity: '32', kit: '2x16', generation: 'ddr5', speed: '6000', latency: '30',
      form: 'dimm', color: 'white', series: 'base' }, fieldUrls: { form: klevvSheet, color: klevvSheet } },
  CMG16GX4M1E3200C16: { mpn: 'CMG16GX4M1E3200C16', brand: 'Corsair', checkedAt,
    url: 'https://www.corsair.com/us/en/p/memory/cmg16gx4m1e3200c16/vengeancea-rgb-rs-16gb-1-x-16gb-ddr4-dram-3200mhz-c16-memory-kit-cmg16gx4m1e3200c16',
    facts: { capacity: '16', kit: '1x16', generation: 'ddr4', speed: '3200', latency: '16',
      form: 'dimm', color: 'black', series: 'rs', lighting: 'rgb' } },
  CMK8GX4M1E3200C16: { mpn: 'CMK8GX4M1E3200C16', brand: 'Corsair', checkedAt,
    url: 'https://www.corsair.com/ca/en/p/memory/cmk8gx4m1e3200c16/vengeancea-lpx-8gb-1-x-8gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk8gx4m1e3200c16',
    facts: { capacity: '8', kit: '1x8', generation: 'ddr4', speed: '3200', latency: '16',
      form: 'dimm', color: 'black', series: 'lpx' } },
  CMK16GX5M1B5600C40: { mpn: 'CMK16GX5M1B5600C40', brand: 'Corsair', checkedAt,
    url: 'https://www.corsair.com/ww/en/p/memory/cmk16gx5m1b5600c40/vengeance-16gb-1x16gb-ddr5-dram-5600mhz-c40-memory-kit-black-cmk16gx5m1b5600c40',
    facts: { capacity: '16', kit: '1x16', generation: 'ddr5', speed: '5600', latency: '40',
      form: 'dimm', color: 'black', series: 'base', lighting: 'non-rgb' }, fieldUrls: { lighting: corsairFaq } },
};

export type RamSubject = { title: string; sku?: string; specs?: Record<string, unknown> };
type FieldProvenance = { value: string; source: 'original-title' | 'original-specs' | 'manufacturer';
  mpn?: string; url?: string; checkedAt?: string };
type CompletedRamIdentity = { originalTitle: string; enrichedTitle: string; attributes: Record<string, string>;
  provenance: Partial<Record<RamField, FieldProvenance>> };
export type RamEnrichmentResult = { ok: true; mpn: string; target: CompletedRamIdentity; source: CompletedRamIdentity }
  | { ok: false; reason: 'unknown-mpn' | 'sku-mismatch' | 'identity-conflict' | 'incomplete-identity';
    side?: 'target' | 'source'; field?: string };

const specFields: Record<string, RamField> = { capacity: 'capacity', capacitygb: 'capacity', kit: 'kit',
  generation: 'generation', speed: 'speed', speedmts: 'speed', latency: 'latency', cl: 'latency',
  form: 'form', formfactor: 'form', color: 'color', series: 'series', lighting: 'lighting', rgb: 'lighting',
  capacidad: 'capacity', generacion: 'generation', frecuencia: 'speed', latencia: 'latency', formato: 'form', iluminacion: 'lighting' };

/** Conserva todos los campos estructurados que gobiernan el planner. No descarta uno inválido. */
export function captureRamSpecs(specs: unknown): Record<string, string | number> | null {
  if (specs === undefined) return {};
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null;
  const captured: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(specs)) {
    const normalized = normalizeIdentityText(key).replace(/\s/g, '');
    if (normalized !== 'sku' && !Object.hasOwn(specFields, normalized)
      && !/^(?:voltage|voltagev|memoryvoltage|vdd|voltaje|tension|profile|profiles|perfil|perfiles|brand|manufacturer|fabricante)$/.test(normalized)) continue;
    if (typeof value !== 'string' && typeof value !== 'number' || typeof value === 'number' && !Number.isFinite(value)) return null;
    if (key.length > 80 || String(value).length > 160) return null;
    captured[key] = value;
  }
  const skuValues = Object.entries(captured).filter(([key]) => normalizeIdentityText(key) === 'sku').map(([, value]) => value);
  if (new Set(skuValues).size > 1) return null;
  return captured;
}

function normalizedValue(field: RamField, value: string): string {
  const text = normalizeIdentityText(value).replace(/\bddr\s+(\d)\b/g, 'ddr$1');
  if (field === 'capacity') return text.replace(/\s*gb$/, '');
  if (field === 'kit') return text.replace(/\s+/g, '').replace(/gb/g, '');
  if (field === 'speed') return text.replace(/\s*(?:mhz|mt s|mts)$/, '');
  if (field === 'latency') return text.replace(/^cl\s*/, '');
  if (field === 'form') return /^(?:udimm|u dimm|dimm|desktop)$/.test(text) ? 'dimm'
    : /^(?:sodimm|so dimm|notebook|laptop)$/.test(text) ? 'sodimm' : text;
  if (field === 'color') return ({ negro: 'black', negra: 'black', blanco: 'white', blanca: 'white', gris: 'grey', gray: 'grey' } as Record<string, string>)[text] ?? text;
  if (field === 'lighting') return /^(?:no|sin|non) rgb$/.test(text) ? 'non-rgb' : text;
  return text;
}

function titleFields(title: string): Partial<Record<RamField, string[]>> {
  return ramTitleFieldsMemo(title);
}
const ramTitleFieldsMemo=createBoundedIdentityTextMemo((title:string)=>titleFieldsUncached(title) as Record<RamField,string[]>,
  fields=>Object.fromEntries(Object.entries(fields).map(([key,values])=>[key,[...values]])) as Record<RamField,string[]>,128);
function titleFieldsUncached(title: string): Partial<Record<RamField, string[]>> {
  const text = normalizeIdentityText(title).replace(/\bddr\s+(\d)\b/g, 'ddr$1');
  const kits = [...text.matchAll(/\b([1-8])\s*x\s*(\d{1,3})\s*(?:gb)?\b/g)].map(m => `${m[1]}x${m[2]}`);
  const capacity = [...text.replace(/\b[1-8]\s*x\s*\d{1,3}\s*gb\b/g, ' ').matchAll(/\b(\d{1,3})\s*gb\b/g)].map(m => m[1]);
  if (/\bsingle\b(?!\s*(?:rank|channel|side|sided|dual|double|canal|rango)\b)|\b(?:1|un|uno) modulo\b/.test(text) && capacity.length === 1) kits.push(`1x${capacity[0]}`);
  const negative = /\b(?:sin|no|non) rgb\b/g;
  return { capacity, kit: kits, generation: text.match(/\bddr\d\b/g) ?? [],
    speed: [...text.matchAll(/\b([2-8]\d{3})\s*(?:mhz|mt s|mts)?\b/g)].map(m => m[1]),
    latency: [...text.matchAll(/\b(?:cl|c)\s*(\d{2,3})\b/g)].map(m => m[1]),
    form: [...text.matchAll(/\b(?:u dimm|so dimm|udimm|sodimm|dimm|desktop|notebook|laptop)\b/g)].map(m => normalizedValue('form', m[0])),
    color: (text.match(/\b(?:white|black|grey|gray|gris|negro|negra|blanco|blanca)\b/g) ?? []).map(v => normalizedValue('color', v)),
    series: text.match(/\b(?:lpx|rs|pro|sl)\b/g) ?? [],
    lighting: [...(/\brgb\b/.test(text.replace(negative, ' ')) ? ['rgb'] : []), ...(negative.test(text) ? ['non-rgb'] : [])] };
}

/** Contrasta sólo afirmaciones presentes; no completa una MPN desconocida. */
export function hasRamSubjectConflict(...subjects: RamSubject[]): boolean {
  const observed: Partial<Record<RamField, Set<string>>> = {};
  for (const subject of subjects) {
    const specs = captureRamSpecs(subject.specs);
    if (!specs) return true;
    const claims = titleFields(subject.title);
    for (const [key, value] of Object.entries(specs)) {
      const specKey = normalizeIdentityText(key).replace(/\s/g, '');
      const field = Object.hasOwn(specFields, specKey) ? specFields[specKey] : undefined;
      if (field) (claims[field] ??= []).push(normalizedValue(field, String(value)));
    }
    for (const [field, values] of Object.entries(claims) as [RamField, string[]][]) {
      const seen = observed[field] ??= new Set();
      for (const value of values) seen.add(value);
      if (seen.size > 1) return true;
    }
  }
  return false;
}

function complete(subject: RamSubject, evidence: ManufacturerRamEvidence): CompletedRamIdentity | string {
  const text = normalizeIdentityText(subject.title);
  // Fabricante y familia se contrastan explícitamente; nunca se derivan de la MPN.
  const brands = text.match(/\b(?:corsair|kingston|adata|patriot|crucial|gskill|hiksemi|klevv|team)\b/g) ?? [];
  if (!brands.length || brands.some(brand => brand !== evidence.brand.toLowerCase())) return 'brand';
  if (evidence.brand === 'Corsair' && !/\bvengeance\b/.test(text)
    || evidence.brand === 'KLEVV' && (!/\bbolt v\b/.test(text) || /\b(?:cras|fit|vengeance|beast)\b/.test(text))) return 'family';
  if (evidence.brand === 'KLEVV') {
    // La ficha agrupa voltajes: no atribuir uno concreto a esta MPN.
    if (/\b\d(?: \d{1,3})?\s*v\b/.test(text) || Object.keys(subject.specs ?? {}).some(key =>
      /^(?:voltage|voltagev|memoryvoltage|vdd|voltaje|tension)$/.test(normalizeIdentityText(key).replace(/\s/g, '')))) return 'voltage-unverified';
    if (/\b(?:sin|no|non) (?:xmp|expo)\b/.test(text)
      || [...text.matchAll(/\bxmp\s*(\d+)(?: (\d+))?\b/g)].some(match => match[1] !== '3' || match[2] !== undefined && match[2] !== '0')) return 'profile';
    for (const [key, value] of Object.entries(subject.specs ?? {})) {
      const specKey = normalizeIdentityText(key).replace(/\s/g, ''), claim = normalizeIdentityText(String(value));
      if (/^(?:brand|manufacturer|fabricante)$/.test(specKey) && claim !== 'klevv') return 'brand';
      if (/^(?:profile|profiles|perfil|perfiles)$/.test(specKey)) {
        if (!/^(?:intel )?xmp(?: 3 0)?(?: amd)?(?: expo)?$|^(?:amd )?expo$/.test(claim)) return 'profile';
        const profileTokens = (value: string) => [...new Set(value.match(/\b(?:xmp|expo)\b/g) ?? [])].sort().join('-');
        if (profileTokens(claim) !== profileTokens(text)) return 'profile-unverified';
      }
    }
  }
  const originalFields = titleFields(subject.title);
  const found = Object.fromEntries(Object.entries(originalFields).map(([field, values]) => [field, [...values]])) as typeof originalFields;
  const provenance: CompletedRamIdentity['provenance'] = {};
  for (const [key, value] of Object.entries(subject.specs ?? {})) {
    const specKey = normalizeIdentityText(key).replace(/\s/g, '');
    const field = Object.hasOwn(specFields, specKey) ? specFields[specKey] : undefined;
    if (!field || typeof value !== 'string' && typeof value !== 'number') continue;
    const normalized = normalizedValue(field, String(value));
    if (evidence.facts[field] !== undefined && normalized !== evidence.facts[field]) return field;
    (found[field] ??= []).push(normalized);
    provenance[field] = { value: normalized, source: 'original-specs' };
  }
  // Un campo fabricante desconocido no puede corroborar una afirmación RGB.
  if (evidence.facts.lighting === undefined && found.lighting?.length) return 'lighting-unverified';
  const append: string[] = [];
  for (const [field, expected] of Object.entries(evidence.facts) as [RamField, string][]) {
    const values = found[field] ?? [];
    if (values.some(value => value !== expected)) return field;
    if (originalFields[field]?.length) {
      provenance[field] ??= { value: expected, source: 'original-title' };
      continue;
    }
    // BASE expresa ausencia de subserie acreditada; no se agrega una palabra al título.
    const token: Record<RamField, string> = { capacity: `${expected}GB`, kit: `${expected}GB`,
      generation: expected.toUpperCase(), speed: `${expected}MHz`, latency: `CL${expected}`,
      form: 'UDIMM', color: expected, series: expected === 'base' ? '' : expected.toUpperCase(),
      lighting: expected === 'non-rgb' ? 'sin RGB' : 'RGB' };
    append.push(token[field]);
    provenance[field] ??= { value: expected, source: 'manufacturer', mpn: evidence.mpn,
      url: evidence.fieldUrls?.[field] ?? evidence.url, checkedAt: evidence.checkedAt };
  }
  const enrichedTitle = [subject.title, ...append.filter(Boolean)].join(' ');
  const attributes = exactRamAttributes(enrichedTitle);
  if (!attributes) return 'incomplete';
  return { originalTitle: subject.title, enrichedTitle, attributes, provenance };
}

/** Plan puro: nunca renueva precios, stock, fechas, claves persistidas ni disponibilidad. */
export function planRamEnrichment(input: { manufacturerMpn: string; target: RamSubject; source: RamSubject }): RamEnrichmentResult {
  const evidence = Object.hasOwn(manufacturerRamEvidence, input.manufacturerMpn)
    ? manufacturerRamEvidence[input.manufacturerMpn] : undefined;
  if (!evidence) return { ok: false, reason: 'unknown-mpn' };
  for (const side of ['target', 'source'] as const) {
    const subject = input[side];
    const specSku = subject.specs?.SKU;
    if ((subject.sku ?? specSku) !== evidence.mpn || specSku !== undefined && specSku !== evidence.mpn)
      return { ok: false, reason: 'sku-mismatch', side };
  }
  const target = complete(input.target, evidence);
  if (typeof target === 'string') return { ok: false, reason: target === 'incomplete' ? 'incomplete-identity' : 'identity-conflict', side: 'target', field: target };
  const source = complete(input.source, evidence);
  if (typeof source === 'string') return { ok: false, reason: source === 'incomplete' ? 'incomplete-identity' : 'identity-conflict', side: 'source', field: source };
  // Sin ampliar el proof existente: el coordinador sólo puede aplicar planes que éste revalida.
  if (JSON.stringify(target.attributes) !== JSON.stringify(source.attributes))
    return { ok: false, reason: 'identity-conflict', field: 'exact-title-proof' };
  return { ok: true, mpn: evidence.mpn, target, source };
}
