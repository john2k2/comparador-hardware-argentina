import type { Product } from '@/lib/types';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';

export const PRODUCT_IMAGE_FALLBACK = '/pixel-box.svg';

// Revisión visual 03/10/2026: este recurso de Katech muestra una notebook.
// La lectura de una imagen no prueba que corresponda al producto. Se aparta
// sólo la contradicción confirmada; no adivinamos otra foto ni tocamos la BD.
const REVIEWED_IMAGE_CATEGORIES = new Map([
  ['https://katech.com.ar/wp-content/uploads/NOT063-5-jpg-webp.webp', 'computadoras'],
]);
// Ilustración usada por Katech como placeholder; no es una foto del hardware.
const REVIEWED_PLACEHOLDERS = new Set(['https://katech.com.ar/wp-content/uploads/placeholder-jpg.webp']);

export function getProductImageSource(product: Pick<Product, 'name' | 'category' | 'image'>): string | undefined {
  const source = normalizeProductImageUrl(product.image);
  if (!source || source === PRODUCT_IMAGE_FALLBACK || REVIEWED_PLACEHOLDERS.has(source)) return undefined;
  const reviewedCategory = REVIEWED_IMAGE_CATEGORIES.get(source);
  const category = inferHardwareCategoryFromName(product.name) ?? product.category;
  if (reviewedCategory && category !== reviewedCategory) return undefined;
  return source;
}

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
