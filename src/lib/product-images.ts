export const PRODUCT_IMAGE_FALLBACK = '/pixel-box.svg';

/** Repara solo el formato legado conocido; no consulta tiendas ni inventa fotos. */
export function normalizeProductImageUrl(source: string | null | undefined): string | undefined {
  const trimmed = source?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

  try {
    const url = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;

    // El mapper anterior resolvía una ruta absoluta contra /productos y perdía
    // esa carpeta. Se conserva el nombre y tamaño de la imagen ya observada.
    if (url.hostname === 'imagenes.compragamer.com') {
      url.protocol = 'https:';
      if (/^\/compragamer_Imganen_general_[^/]+-(?:med|grn|mini)\.jpg$/i.test(url.pathname)) {
        url.pathname = `/productos${url.pathname}`;
      }
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Conserva la primera foto real al fusionar registros que ya son equivalentes. */
export function pickProductImage(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    const normalized = normalizeProductImageUrl(source);
    if (normalized && normalized !== PRODUCT_IMAGE_FALLBACK) return normalized;
  }
  return PRODUCT_IMAGE_FALLBACK;
}
