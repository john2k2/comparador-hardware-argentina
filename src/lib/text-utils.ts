// ============================================
// Text Utils - Normalizacion de texto para UI
// ============================================

const SUSPICIOUS_MOJIBAKE = /[ÃÂâ�]/;
const MOJIBAKE_TOKENS = /[ÃÂâ�]/g;

function countMojibakeTokens(value: string): number {
  return (value.match(MOJIBAKE_TOKENS) ?? []).length;
}

function decodeLatin1AsUtf8(value: string): string {
  const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function cleanupTypographicArtifacts(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/�/g, '');
}

export function normalizeDisplayText(value: string | null | undefined): string {
  if (!value) return '';

  let current = value.replace(/\s+/g, ' ').trim();
  if (!current) return '';

  for (let pass = 0; pass < 2; pass += 1) {
    if (!SUSPICIOUS_MOJIBAKE.test(current)) break;

    const decoded = decodeLatin1AsUtf8(current);
    const currentScore = countMojibakeTokens(current);
    const decodedScore = countMojibakeTokens(decoded);

    if (decodedScore < currentScore) {
      current = decoded;
      continue;
    }

    break;
  }

  return cleanupTypographicArtifacts(current).replace(/\s+/g, ' ').trim();
}
