import type { HardwareCategory } from '@/lib/types';

const BUNDLE_TERMS = [
  'combo', 'kit', 'armado', 'armada', 'pc gamer', 'pc completa', 'pc creadores',
  'computadora', 'desktop', 'workstation', 'notebook', 'laptop', 'all in one',
  'netbook', 'chromebook', 'build', 'bundle', 'paquete',
];
const COMPLETE_COMPUTER_TERMS = [
  'pc armado', 'pc armada', 'pc gamer', 'pc completa', 'pc creadores',
  'computadora', 'desktop', 'escritorio', 'workstation', 'notebook', 'laptop',
  'all in one', 'netbook', 'chromebook', 'build',
];
const BRAND_PATTERN = /\b(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|intel|amd|logitech|razer|hyperx|corsair|kingston|adata|patriot|crucial|gskill|hiksemi|klevv|steelseries|redragon|keychron|cooler\s*master|benq|aoc|viewsonic|samsung|lg|dell|hp|lenovo|team)\b/;
const CPU_SUFFIX_ALTERNATION = 'x3d|gt|ge|xt|x|g|f|t';

export type ChipSignature = {
  family: string;
  number: string;
  suffixes: string[];
};
const GPU_VARIANTS = [
  'aorus', 'strix', 'tuf', 'dual', 'prime', 'proart', 'eagle', 'windforce',
  'gaming', 'ventus', 'shadow', 'suprim', 'trinity', 'phoenix', 'pulse',
  'nitro', 'challenger', 'hellhound', 'red devil', 'white',
];
const MB_VARIANTS = [
  'aorus', 'strix', 'tuf', 'prime', 'tomahawk', 'mortar',
  'steel legend', 'ds3h', 'pro', 'elite', 'gaming', 'eagle',
];
const GENERIC_MODEL_STOPWORDS = new Set([
  'teclado', 'keyboard', 'mouse', 'monitor', 'auricular', 'auriculares', 'headset', 'microfono', 'microphone',
  'webcam', 'camara', 'cam', 'gamer', 'gaming', 'rgb', 'usb', 'bluetooth',
  'mecanico', 'mecanica', 'mechanical', 'switch', 'con', 'sin', 'de', 'del', 'la', 'el', 'los', 'las', 'para', 'por',
  'edition', 'series',
]);
const GENERIC_MODEL_NOISY_SUFFIXES = [
  'usb', 'rgb', 'wireless', 'bluetooth', 'espanol', 'ingles', 'spanish', 'english',
  'black', 'white', 'negro', 'blanco', 'gris', 'gray',
];
const GENERIC_VARIANT_HINTS = new Set([
  'x', 'hero', 'lightspeed', 'wireless', 'pro', 'plus', 'max', 'mini', 'se',
  'v2', 'v3', 'mk2', 'mk3',
]);

export function normalizeIdentityText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildIdentitySource(primaryTitle: string, fallbackTitle?: string): string {
  const primaryNormalized = normalizeIdentityText(primaryTitle);
  const fallbackNormalized = fallbackTitle ? normalizeIdentityText(fallbackTitle) : '';

  if (primaryNormalized && fallbackNormalized && primaryNormalized !== fallbackNormalized) {
    return `${primaryNormalized} ${fallbackNormalized}`.trim();
  }

  return primaryNormalized || fallbackNormalized;
}

function slugifyIdentityPart(value: string): string {
  return value
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function compactToken(value: string): string {
  return value.replace(/\s+/g, '');
}

function firstMatch(pattern: RegExp, value: string): string | null {
  const match = value.match(pattern)?.[1] ?? null;
  return match ? compactToken(match) : null;
}

function detectFamilyToken(normalized: string): string {
  if (/\b(teclado|keyboard|keycaps?)\b/.test(normalized)) return 'kbd';
  if (/\b(mouse|mice|raton)\b/.test(normalized)) return 'mouse';
  if (/\b(monitor|display|panel|ips|va|oled)\b/.test(normalized)) return 'monitor';
  if (/\b(auricular|auriculares|headset|headphone|earbuds?)\b/.test(normalized)) return 'audio';
  if (/\b(microfono|microphone|mic)\b/.test(normalized)) return 'mic';
  if (/\b(webcam|camera|camara|cam)\b/.test(normalized)) return 'cam';
  return 'other';
}

function extractStrongModelTokens(normalized: string): string[] {
  const normalizeStrongToken = (token: string): string => {
    let value = token;

    const mergedVariantMatch = value.match(/^([a-z]+\d{2,5})(x|pro|plus|max|mini|hero|v2|v3)$/);
    if (mergedVariantMatch?.[1]) {
      value = mergedVariantMatch[1];
    }

    for (const suffix of GENERIC_MODEL_NOISY_SUFFIXES) {
      if (!value.endsWith(suffix)) continue;
      const trimmed = value.slice(0, -suffix.length);
      if (trimmed.length < 3) continue;
      if (!/(?=.*[a-z])(?=.*\d)/.test(trimmed)) continue;
      value = trimmed;
      break;
    }
    return value;
  };

  return normalized
    .split(' ')
    .map((token) => normalizeStrongToken(token.trim()))
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) =>
      /(?=.*[a-z])(?=.*\d)/.test(token)
      || /^\d{2,3}(?:hz|w|wh|mm|ml|gb|tb)$/.test(token),
    );
}

function extractGenericVariantTokens(normalized: string, strongTokens: string[]): string[] {
  if (strongTokens.length === 0) return [];
  const strongSet = new Set(strongTokens);
  const tokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  const variants: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!GENERIC_VARIANT_HINTS.has(token)) continue;

    const previous = tokens[index - 1] ?? '';
    if (!previous || !strongSet.has(previous)) continue;
    variants.push(`${previous}-${token}`);
  }

  for (const token of tokens) {
    const mergedVariantMatch = token.match(/^([a-z]+\d{2,5})(x|pro|plus|max|mini|hero|v2|v3)$/);
    if (!mergedVariantMatch) continue;
    const base = mergedVariantMatch[1];
    const variant = mergedVariantMatch[2];
    if (!strongSet.has(base)) continue;
    variants.push(`${base}-${variant}`);
  }

  return variants;
}

function extractSoftModelTokens(normalized: string, brand: string): string[] {
  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => token !== brand)
    .filter((token) => !GENERIC_MODEL_STOPWORDS.has(token))
    .slice(0, 6);
}

function pickVariant(normalized: string, variants: string[]): string | null {
  for (const variant of variants) {
    const escaped = variant.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`\\b${escaped}\\b`).test(normalized)) {
      return compactToken(variant);
    }
  }
  return null;
}

export function isBundleLikeTitle(value: string): boolean {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return false;
  if (normalized.includes('+')) return true;

  const wrapped = ` ${normalized} `;
  return BUNDLE_TERMS.some((term) => wrapped.includes(` ${term} `));
}

export function isCompleteComputerTitle(value: string): boolean {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return false;
  const wrapped = ` ${normalized} `;
  if (COMPLETE_COMPUTER_TERMS.some((term) => wrapped.includes(` ${term} `))) return true;

  const componentFamilies = [
    /\b(ryzen|core\s*i[3579]|procesador|cpu)\b/,
    /\b(rtx|gtx|radeon|geforce|rx\s*\d{3,4}|gpu)\b/,
    /\b(motherboard|mother|placa\s+madre)\b/,
    /\b(ddr4|ddr5|ram|memoria)\b/,
    /\b(ssd|nvme|hdd|disco)\b/,
  ];
  const familyCount = componentFamilies.filter((pattern) => pattern.test(normalized)).length;
  const hasCpuOrGpu = componentFamilies[0].test(normalized) || componentFamilies[1].test(normalized);
  const pcHints = [
    /\b\d{1,2}\s*gb\b/,
    /\b(?:\d+\s*tb|\d{3,4}\s*gb)\b/,
    /\b[abhx]\d{3}[a-z]?\b/,
    /\b(?:arc|b580)\b/,
  ].filter((pattern) => pattern.test(normalized)).length;
  if (/\bpc\b/.test(normalized) && hasCpuOrGpu && familyCount + pcHints >= 2) return true;

  const hasBundleMarker = normalized.includes('+') || /\b(combo|kit|bundle|paquete)\b/.test(normalized);
  if (!hasBundleMarker) return false;

  return familyCount >= 2;
}

export function parseCpuModelSignature(value: string): ChipSignature | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const ryzen = normalized.match(new RegExp(`\\bryzen\\s*(?:([3579])\\s+)?(\\d{3,5})(${CPU_SUFFIX_ALTERNATION})?\\b`));
  if (ryzen) {
    return {
      family: ryzen[1] ? `ryzen${ryzen[1]}` : 'ryzen',
      number: ryzen[2],
      suffixes: ryzen[3] ? [ryzen[3]] : [],
    };
  }

  const intel = normalized.match(/\bcore\s*i([3579])\s*(\d{4,5})([a-z]{0,2})\b/);
  if (intel) {
    return {
      family: `corei${intel[1]}`,
      number: intel[2],
      suffixes: intel[3] ? [intel[3]] : [],
    };
  }

  const bareSuffixed = normalized.match(new RegExp(`\\b(\\d{3,5})(${CPU_SUFFIX_ALTERNATION})\\b`));
  if (bareSuffixed) {
    return { family: 'unknown', number: bareSuffixed[1], suffixes: [bareSuffixed[2]] };
  }

  if (/\b(ryzen|core|procesador|micro)\b/.test(normalized)) {
    const number = normalized.match(/\b(\d{3,5})\b/);
    if (number) return { family: 'unknown', number: number[1], suffixes: [] };
  }

  if (/^\d{3,5}$/.test(normalized)) {
    return { family: 'unknown', number: normalized, suffixes: [] };
  }

  return null;
}

export function parseGpuChipSignature(value: string): ChipSignature | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const nvidia = normalized.match(/\b(?:geforce\s+)?(rtx|gtx)\s*(\d{3,4})(?:\s*(ti))?(?:\s*(super)|\s+s(?=\s|$))?\b/);
  if (nvidia) {
    const suffixes: string[] = [];
    if (nvidia[3]) suffixes.push('ti');
    if (nvidia[4] === 'super' || (nvidia[3] && /\b(?:rtx|gtx)\s*\d{3,4}\s*ti\s+s(?:\s|$)/.test(normalized))) {
      suffixes.push('super');
    }
    return { family: nvidia[1], number: nvidia[2], suffixes };
  }

  const amd = normalized.match(/\b(?:radeon\s+)?rx\s*(\d{3,4})(?:\s*(xtx|xt))?\b/);
  if (amd) {
    return {
      family: 'rx',
      number: amd[1],
      suffixes: amd[2] ? [amd[2]] : [],
    };
  }

  const arc = normalized.match(/\barc\s*([a-z]?\d{3})\b/);
  if (arc) {
    return { family: 'arc', number: arc[1], suffixes: [] };
  }

  return null;
}

export function compactGpuChip(signature: ChipSignature): string {
  return `${signature.family}${signature.number}${signature.suffixes.join('')}`;
}

function detectRamFormFactor(normalized: string): 'sodimm' | 'dimm' | 'unk' {
  if (/\b(sodimm|so\s*dimm|notebook|laptop)\b/.test(normalized)) return 'sodimm';
  if (/\b(udimm|dimm|desktop)\b/.test(normalized)) return 'dimm';
  return 'unk';
}

function detectRamFamily(normalized: string): string {
  if (/\bimpact\b/.test(normalized)) return 'impact';
  if (/\bbeast\b/.test(normalized)) return 'beast';
  if (/\bvengeance\b/.test(normalized)) return 'vengeance';
  if (/\blancer\b/.test(normalized)) return 'lancer';
  if (/\bviper\b/.test(normalized)) return 'viper';
  if (/\bvenom\b/.test(normalized)) return 'venom';
  if (/\bvulcan\b/.test(normalized)) return 'vulcan';
  return 'other';
}

export function extractRamModelKey(value: string): string | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const brand = firstMatch(BRAND_PATTERN, normalized) ?? 'na';
  const form = detectRamFormFactor(normalized);
  const family = detectRamFamily(normalized);
  const capacity = firstMatch(/\b(\d{1,2}\s*gb)\b/, normalized) ?? 'na';
  const gen = firstMatch(/\b(ddr[45])\b/, normalized) ?? 'na';
  const speed = firstMatch(/\b(4800|5200|5600|6000|6400|6800|7200|7600|8000|8200|8400)\b/, normalized) ?? 'na';
  return `ram:${brand}:${family}:${capacity}:${gen}:${speed}:${form}`;
}

export function extractCpuModelKey(value: string): string | null {
  const signature = parseCpuModelSignature(value);
  if (!signature || signature.family === 'unknown') return null;
  return `cpu:${signature.family}${signature.number}${signature.suffixes.join('')}`;
}

export function extractGpuModelKey(value: string): string | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const chip = parseGpuChipSignature(normalized);
  if (!chip) return null;

  const memory = firstMatch(/\b(\d{1,2}\s*gb)\b/, normalized) ?? 'na';
  const brand = firstMatch(BRAND_PATTERN, normalized) ?? 'na';
  const variant = pickVariant(normalized, GPU_VARIANTS) ?? 'base';

  return `gpu:${compactGpuChip(chip)}:${memory}:${brand}:${variant}`;
}

export function extractMotherboardModelKey(value: string): string | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const chipset = firstMatch(/\b([abhxz]\d{3}[a-z]{0,2})\b/, normalized);
  if (!chipset) return null;

  const brand = firstMatch(BRAND_PATTERN, normalized) ?? 'na';
  const socket = firstMatch(/\b(am4|am5|lga\s*\d{3,4})\b/, normalized) ?? 'na';
  const variant = pickVariant(normalized, MB_VARIANTS) ?? 'base';
  const wifi = /\bwifi\b/.test(normalized) ? 'wifi' : 'nowifi';

  return `mb:${brand}:${chipset}:${socket}:${variant}:${wifi}`;
}

type GenericModelOptions = {
  allowSoftTokens?: boolean;
};

export function extractGenericModelKey(value: string, options: GenericModelOptions = {}): string | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const brand = firstMatch(BRAND_PATTERN, normalized) ?? 'na';
  const family = detectFamilyToken(normalized);
  const strongTokens = Array.from(new Set(extractStrongModelTokens(normalized))).slice(0, 4);
  const variantTokens = Array.from(new Set(extractGenericVariantTokens(normalized, strongTokens))).slice(0, 2);

  if (strongTokens.length > 0) {
    const identityTokens = [...strongTokens, ...variantTokens];
    return `generic:${brand}:${family}:${identityTokens.join('-')}`;
  }

  if (options.allowSoftTokens !== true) return null;

  const softTokens = Array.from(new Set(extractSoftModelTokens(normalized, brand)));
  if (softTokens.length < 2) return null;
  return `generic:${brand}:${family}:${softTokens.slice(0, 4).join('-')}`;
}

export function buildProductIdentityKey(
  category: HardwareCategory,
  primaryTitle: string,
  fallbackTitle?: string,
): string {
  const source = buildIdentitySource(primaryTitle, fallbackTitle);

  if (!source) return `${category}::unknown`;
  if (isBundleLikeTitle(source)) return `${category}::bundle:${slugifyIdentityPart(source)}`;

  if (category === 'procesadores') {
    const cpuKey = extractCpuModelKey(source);
    if (cpuKey) return `${category}::${cpuKey}`;
  }

  if (category === 'tarjetas-graficas') {
    const gpuKey = extractGpuModelKey(source);
    if (gpuKey) return `${category}::${gpuKey}`;
  }

  if (category === 'motherboards') {
    const motherboardKey = extractMotherboardModelKey(source);
    if (motherboardKey) return `${category}::${motherboardKey}`;
  }

  if (category === 'memoria-ram') {
    const ramKey = extractRamModelKey(source);
    if (ramKey) return `${category}::${ramKey}`;
  }

  const genericKey = extractGenericModelKey(source, { allowSoftTokens: true });
  if (genericKey) return `${category}::${genericKey}`;

  return `${category}::name:${slugifyIdentityPart(source)}`;
}

export function extractExactModelIdentity(
  category: HardwareCategory,
  title: string,
): string | null {
  if (isBundleLikeTitle(title)) return null;

  if (category === 'procesadores') {
    return extractCpuModelKey(title);
  }
  if (category === 'tarjetas-graficas') {
    return extractGpuModelKey(title);
  }
  if (category === 'motherboards') {
    return extractMotherboardModelKey(title);
  }
  if (category === 'memoria-ram') {
    return extractRamModelKey(title);
  }

  return extractGenericModelKey(title, { allowSoftTokens: false });
}

function extractCpuFamilyKey(value: string): string | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const ryzenMatch = normalized.match(/\bryzen\s*([3579])\s*(\d{3,5})[a-z0-9]*\b/);
  if (ryzenMatch) {
    return `cpu-family:ryzen${ryzenMatch[1]}-${ryzenMatch[2]}`;
  }

  const intelMatch = normalized.match(/\bcore\s*i([3579])\s*(\d{4,5})[a-z]{0,2}\b/);
  if (intelMatch) {
    return `cpu-family:corei${intelMatch[1]}-${intelMatch[2]}`;
  }

  return null;
}

function extractGpuFamilyKey(value: string): string | null {
  const chip = parseGpuChipSignature(value);
  if (!chip) return null;
  return `gpu-family:${compactGpuChip(chip)}`;
}

function extractMotherboardFamilyKey(value: string): string | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const chipset = firstMatch(/\b([abhxz]\d{3}[a-z]{0,2})\b/, normalized);
  if (!chipset) return null;

  const brand = firstMatch(BRAND_PATTERN, normalized) ?? 'na';
  const socket = firstMatch(/\b(am4|am5|lga\s*\d{3,4})\b/, normalized) ?? 'na';
  return `mb-family:${brand}:${chipset}:${socket}`;
}

function extractGenericFamilyKey(value: string): string | null {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return null;

  const brand = firstMatch(BRAND_PATTERN, normalized) ?? 'na';
  const family = detectFamilyToken(normalized);
  const strongTokens = Array.from(new Set(extractStrongModelTokens(normalized))).slice(0, 3);

  if (strongTokens.length > 0) {
    return `generic-family:${brand}:${family}:${strongTokens.join('-')}`;
  }

  const softTokens = Array.from(new Set(extractSoftModelTokens(normalized, brand))).slice(0, 3);
  if (softTokens.length < 2) return null;
  return `generic-family:${brand}:${family}:${softTokens.join('-')}`;
}

export function buildProductFamilyKey(
  category: HardwareCategory,
  primaryTitle: string,
  fallbackTitle?: string,
): string | null {
  const source = buildIdentitySource(primaryTitle, fallbackTitle);

  if (!source || isBundleLikeTitle(source)) return null;

  if (category === 'procesadores') {
    return extractCpuFamilyKey(source);
  }
  if (category === 'tarjetas-graficas') {
    return extractGpuFamilyKey(source);
  }
  if (category === 'motherboards') {
    return extractMotherboardFamilyKey(source);
  }

  return extractGenericFamilyKey(source);
}

export function buildProductVariantKey(
  category: HardwareCategory,
  primaryTitle: string,
  fallbackTitle?: string,
): string {
  const source = buildIdentitySource(primaryTitle, fallbackTitle);

  if (!source) return `${category}::unknown`;
  if (isBundleLikeTitle(source)) return `${category}::bundle`;

  const exact = extractExactModelIdentity(category, source);
  if (exact) return `${category}::${exact}`;

  const genericKey = extractGenericModelKey(source, { allowSoftTokens: true });
  if (genericKey) return `${category}::${genericKey}`;

  return `${category}::name:${slugifyIdentityPart(source)}`;
}
