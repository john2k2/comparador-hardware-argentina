export type OfferReportContext = {
  productId?: string;
  productName: string;
  storeId?: string;
  storeName?: string;
  offerUrl?: string;
};

export type ReportSearchParams = Record<string, string | string[] | undefined>;

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function publicOfferUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1_500) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    // Conserva sólo identificadores de producto; excluye sesión, tokens y tracking.
    for (const [key, item] of [...url.searchParams.entries()]) {
      if (!/^(?:id|product|product_id|producto|sku|item|p|pid|variant)$/i.test(key) || !/^[\w.-]{1,128}$/.test(item)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch { return undefined; }
}

export function parseOfferReport(params: ReportSearchParams): OfferReportContext | null {
  if (params.report !== 'offer') return null;
  const productName = cleanText(params.productName, 180);
  if (!productName) return null;
  return {
    // Un ID nunca se trunca: podría apuntar a otra ficha.
    productId: typeof params.productId === 'string' && params.productId.length <= 256
      && !/[\u0000-\u001f\u007f]/.test(params.productId) ? params.productId || undefined : undefined,
    productName,
    storeId: cleanText(params.storeId, 80) || undefined,
    storeName: cleanText(params.storeName, 100) || undefined,
    offerUrl: publicOfferUrl(params.offerUrl),
  };
}

export function buildOfferReportHref(context: OfferReportContext): string {
  const parsed = parseOfferReport({ report: 'offer', ...context });
  if (!parsed) return '/contacto#reportar-oferta';
  const params = new URLSearchParams({ report: 'offer', productName: parsed.productName });
  for (const [key, value] of Object.entries(parsed)) if (value) params.set(key, value);
  return `/contacto?${params}#reportar-oferta`;
}

export function buildOfferReportBody(context: OfferReportContext, siteUrl: string): string {
  const lines = ['Quiero reportar un precio o enlace.', '', `Producto: ${context.productName}`];
  if (context.productId) lines.push(`Ficha: ${siteUrl}/product/${encodeURIComponent(context.productId)}`);
  if (context.storeName || context.storeId) lines.push(`Tienda: ${context.storeName || context.storeId}`);
  if (context.offerUrl) lines.push(`Publicación: ${context.offerUrl}`);
  return [...lines, '', 'Problema observado:', '', 'Fecha y precio/stock que muestra la tienda:', ''].join('\n');
}
