import { extractRamModelKey, normalizeIdentityText } from '@/lib/product-identity';

function unique(values: string[]): string | undefined {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

/** Alias escritos en la fuente: nunca deduce forma, kit o CL desde un SKU. */
function canonicalRamTitle(value: string): string {
  return normalizeIdentityText(value)
    .replace(/\bddr\s+(\d)\b/g, 'ddr$1')
    .replace(/\bu\s+dimm\b/g, 'udimm')
    .replace(/\bso\s+dimm\b/g, 'sodimm')
    .replace(/\b(?:gray|gris)\b/g, 'grey')
    .replace(/\b(?:blanco|blanca)\b/g, 'white')
    .replace(/\b(?:negro|negra)\b/g, 'black')
    .replace(/\b(\d{1,3})\s*gb\b/g, '$1gb')
    .replace(/\b(\d)\s*x\s*(\d{1,3})gb\b/g, '$1x$2gb')
    .replace(/\bcl\s*(\d{2,3})\b/g, 'cl$1');
}

/** Prueba RAM separada de las claves persistidas; conserva el título y toda variante. */
export function exactRamAttributes(name: string): Record<string, string> | null {
  // El subject persistido pierde estos signos con normalizeIdentityText. Hasta
  // preservar su evidencia en todo el contrato no se puede revalidar la prueba.
  if (/[×*]/.test(name)) return null;
  let title = canonicalRamTitle(name);
  if (!title || /\b(?:combo|bundle|computadora|pc gamer|mini pc|tablet|procesador|ryzen|core i\d|rtx|gtx|ssd|motherboard|adaptador|adapter|funda|teclado|carcasa|lote|pack)\b/.test(title)
    || /^(?:disipador|cooler|refrigerador|soporte)\b/.test(title)
    || /\b(?:disipador|cooler|refrigerador|soporte|kit de disipadores) para\b/.test(title)
    || /\bddr\s*\d\s*[/|]\s*\d\b|\bcl\s*\d{2,3}\s*[/|]\s*\d{2,3}\b/i.test(name)
    || name.includes('+')) return null;

  const kits = [...title.matchAll(/\b([1-8])x(\d{1,3})gb\b/g)].map(match => `${match[1]}x${match[2]}`);
  const withoutKits = title.replace(/\b\d+x\d+gb\b/g, ' ');
  const capacity = unique([...withoutKits.matchAll(/\b(\d{1,3})gb\b/g)].map(match => match[1]));
  // Single Rank/Channel describe organización eléctrica, no cantidad de módulos.
  const singlePattern = /\bsingle\b(?!\s*(?:rank|channel|side|sided|face|dual|double|canal|rango)\b)/g;
  const single = singlePattern.test(title);
  const singleModule = /\b(?:1|un|uno) modulo\b/.test(title);
  if (single || singleModule) {
    if (!capacity || kits.some(kit => kit !== `1x${capacity}`)) return null;
    kits.push(`1x${capacity}`);
    title = title.replace(singlePattern, `1x${capacity}gb`)
      .replace(/\b(?:1|un|uno) modulo\b/g, `1x${capacity}gb`);
  }
  const kit = unique(kits);
  if (!capacity || !kit || Number(capacity) <= 0) return null;
  const [count, perModule] = kit.split('x').map(Number);
  const counts = [...title.matchAll(/\b([1-8]|dos|tres|cuatro) modulos\b/g)]
    .map(match => ({ dos: 2, tres: 3, cuatro: 4 }[match[1]] ?? Number(match[1])));
  if (count * perModule !== Number(capacity) || perModule <= 0 || counts.some(value => value !== count)) return null;

  const generation = unique(title.match(/\bddr\d\b/g) ?? []);
  const speed = unique([...title.matchAll(/\b([2-8]\d{3})\s*(?:mhz|mt s|mts)?\b/g)].map(match => match[1]));
  const latency = unique([...title.matchAll(/\bcl(\d{2,3})\b/g)].map(match => match[1]));
  const color = unique(title.match(/\b(?:white|black|grey)\b/g) ?? []);
  const forms = [...title.matchAll(/\b(?:sodimm|udimm|dimm|desktop|notebook|laptop)\b/g)]
    .map(match => /^(?:sodimm|notebook|laptop)$/.test(match[0]) ? 'sodimm' : 'dimm');
  const form = unique(forms);
  const negativeRgb = /\b(?:sin|no|non) rgb\b/.test(title);
  const positiveRgb = /\brgb\b/.test(title.replace(/\b(?:sin|no|non) rgb\b/g, ' '));
  const conditions = title.match(/\b(?:nuevo|new|outlet|usado|used|reacondicionado|refurbished)\b/g) ?? [];
  const brands = title.match(/\b(?:corsair|kingston|adata|patriot|crucial|gskill|hiksemi|klevv|team)\b/g) ?? [];
  const brand = unique(brands);
  const families = title.match(/\b(?:impact|beast|vengeance|lancer|viper|venom|vulcan)\b/g) ?? [];
  const voltages = [...title.matchAll(/\b(\d)(?: (\d{1,3}))?v\b/g)]
    .map(match => String(Number(`${match[1]}.${match[2] ?? '0'}`)));
  if (!generation || !['ddr4', 'ddr5'].includes(generation) || !speed || !latency || Number(latency) <= 0 || !color || !form || negativeRgb && positiveRgb
    || new Set(conditions).size > 1 || new Set(voltages).size > 1 || !brand || new Set(families).size !== 1
    || /\blpx\b/.test(title) && /\b(?:rs|pro|sl)\b/.test(title)
    || /\brs\b/.test(title) && /\b(?:pro|sl)\b/.test(title)) return null;

  const key = extractRamModelKey(title);
  if (!key) return null;
  // GREY se verifica por separado: no se convierte en BLACK para pasar el gate viejo.
  const parts = key.split(':');
  if (parts.slice(0, -1).some(part => ['na', 'unk', 'unknown-kit'].includes(part))) return null;
  parts[1] = brand;
  parts[3] = `${capacity}gb`;
  parts[parts.length - 1] = color;
  const profile = ['xmp', 'expo'].filter(value => new RegExp(`\\b${value}\\b`).test(title)).join('-');
  return { model: parts.join(':'), capacity, kit, generation, speed, form, latency, color,
    profile, condition: conditions[0] ?? '', title };
}
