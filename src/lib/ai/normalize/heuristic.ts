import {
  TITLE_STOPWORDS,
  TITLE_NOISE_WORDS,
  BRAND_PATTERN,
  GPU_CHIP_PATTERN,
  CPU_CHIP_PATTERN,
  MEMORY_SIZE_PATTERN,
  SOCKET_PATTERN,
  CHIPSET_PATTERN,
  STORAGE_SIZE_PATTERN,
  KNOWN_VARIANTS,
} from './patterns';

export function normalizeInputTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

export function normalizeModelSpacing(value: string): string {
  return value
    .replace(/\b(RTX|GTX|RX)\s*(\d{3,4})(?:\s*(TI|SUPER|XT))?\b/gi, (_, chip, series, suffix) => {
      const suffixPart = suffix ? ` ${String(suffix).toUpperCase()}` : '';
      return `${String(chip).toUpperCase()} ${series}${suffixPart}`;
    })
    .replace(/\b(RYZEN)\s*([3579])\s*([0-9]{3,5}[A-Z0-9]{0,3})\b/gi, (_, brand, tier, model) =>
      `${String(brand).toUpperCase()} ${tier} ${String(model).toUpperCase()}`,
    )
    .replace(/\b(CORE)\s*I([3579])\s*([0-9]{4,5}[A-Z]{0,2})\b/gi, (_, core, tier, model) =>
      `${String(core).toUpperCase()} I${tier} ${String(model).toUpperCase()}`,
    )
    .replace(/\b(\d{1,2})\s*G\b/gi, '$1GB')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForHeuristic(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanCapturedToken(token: string | undefined): string {
  return (token ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function normalizeMemorySize(token: string): string {
  if (!token) return '';
  const normalized = cleanCapturedToken(token);
  const digits = normalized.replace(/\D/g, '');
  if (!digits) return '';
  return `${digits}GB`;
}

export function firstMatch(pattern: RegExp, input: string): string {
  const matched = input.match(pattern)?.[1];
  return cleanCapturedToken(matched);
}

export function extractVariants(input: string): string[] {
  const wrapped = ` ${input} `;
  return KNOWN_VARIANTS.filter((variant) => wrapped.includes(` ${variant} `));
}

export function dedupeTokens(tokens: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const cleaned = cleanCapturedToken(token);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

export function buildHeuristicNormalizedTitle(rawTitle: string): string {
  const normalized = normalizeForHeuristic(rawTitle);
  if (!normalized) return rawTitle;

  const isBundle = /(^|\s)(COMBO|KIT|ARMADO|BUILD)(\s|$)/.test(normalized)
    || /\+/.test(normalized)
    || /(^|\s)PC(\s|$)/.test(normalized);
  const normalizedForPatterns = normalized.replace(/\+/g, ' ');

  const brand = firstMatch(BRAND_PATTERN, normalizedForPatterns);
  const gpuChip = firstMatch(GPU_CHIP_PATTERN, normalizedForPatterns);
  const cpuChip = firstMatch(CPU_CHIP_PATTERN, normalizedForPatterns);
  const memorySize = normalizeMemorySize(firstMatch(MEMORY_SIZE_PATTERN, normalizedForPatterns));
  const socket = firstMatch(SOCKET_PATTERN, normalizedForPatterns);
  const chipset = firstMatch(CHIPSET_PATTERN, normalizedForPatterns);
  const storageSize = firstMatch(STORAGE_SIZE_PATTERN, normalizedForPatterns);
  const variants = extractVariants(normalizedForPatterns);

  const structuredTokens = dedupeTokens([
    brand,
    gpuChip || cpuChip,
    ...variants.slice(0, 2),
    memorySize,
    socket,
    chipset,
    storageSize,
  ]);

  if (structuredTokens.length >= 2) {
    const canonicalStructured = structuredTokens.join(' ').trim();
    const normalizedStructured = normalizeModelSpacing(canonicalStructured);
    return isBundle ? `COMBO ${normalizedStructured}` : normalizedStructured;
  }

  const tokens = normalized
    .replace(/\+/g, ' + ')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 1)
    .filter((token) => !TITLE_STOPWORDS.has(token))
    .filter((token) => !TITLE_NOISE_WORDS.has(token));

  const uniqueSortedTokens = dedupeTokens(tokens).sort();
  const compact = uniqueSortedTokens.join(' ').trim();
  const canonical = normalizeModelSpacing(compact || normalized);
  return isBundle ? `COMBO ${canonical}` : canonical;
}

export function normalizeOutputTitle(originalTitle: string, candidateTitle: string | undefined): string {
  const cleaned = (candidateTitle ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned) return normalizeModelSpacing(cleaned);
  return normalizeModelSpacing(buildHeuristicNormalizedTitle(originalTitle));
}
