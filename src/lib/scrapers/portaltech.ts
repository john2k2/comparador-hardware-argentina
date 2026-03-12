import * as cheerio from 'cheerio';
import { HardwareCategory, Product, StockStatus } from '../types';

const PORTALTECH_BASE_URL = 'https://portalstore.com.ar';
const CLOUDFLARE_RENDER_TIMEOUT_MS = 30_000;
const PORTALTECH_HTML_CACHE_TTL_MS = 15 * 60 * 1000;
const PORTALTECH_BACKOFF_MS = 15 * 60 * 1000;

const DETAIL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const CATEGORY_SEARCH_TERMS: Record<HardwareCategory, string[]> = {
  procesadores: ['ryzen', 'procesador amd'],
  'tarjetas-graficas': ['rtx', 'placa de video'],
  motherboards: ['motherboard', 'placa madre'],
  'memoria-ram': ['memoria ram', 'ddr5'],
  almacenamiento: ['ssd', 'nvme'],
  'fuentes-alimentacion': ['fuente', 'psu'],
  gabinetes: ['gabinete', 'case'],
  refrigeracion: ['cooler', 'watercooler'],
  perifericos: ['monitor', 'teclado'],
};

type CloudflareContentResponse = {
  success?: boolean;
  result?: string;
  errors?: Array<{
    code?: number;
    message?: string;
  }>;
};

const renderedHtmlCache = new Map<string, { expiresAt: number; html: string }>();
let portalTechBackoffUntil = 0;

function getCloudflareCredentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '';
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
  return {
    accountId: accountId.trim(),
    apiToken: apiToken.trim(),
  };
}

function isCloudflareBrowserRenderingConfigured(): boolean {
  const { accountId, apiToken } = getCloudflareCredentials();
  return Boolean(accountId && apiToken);
}

function normalizeAbsoluteUrl(href: string): string {
  return new URL(href, PORTALTECH_BASE_URL).toString();
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function parseArsPrice(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const raw = String(value ?? '').replace(/[^0-9,.]/g, '');
  if (!raw) return 0;
  const normalized = raw.replace(/[,.]\d{1,2}$/, '').replace(/[,.]/g, '');
  return parseInt(normalized, 10) || 0;
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeSearchValue(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function slugFromProductUrl(url: string): string {
  return url.split('/producto/')[1]?.split(/[?#]/)[0] ?? '';
}

function extractBrand(name: string): string {
  const brands = [
    'AMD', 'Intel', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'ASRock',
    'Kingston', 'Corsair', 'G.Skill', 'Samsung', 'WD', 'Seagate',
    'Crucial', 'Patriot', 'XPG', 'Thermaltake', 'Cooler Master',
    'be quiet!', 'Noctua', 'Arctic', 'Sapphire', 'PowerColor', 'Zotac',
    'EVGA', 'PNY', 'HyperX', 'Redragon', 'Logitech', 'Razer', 'Acer',
    'Lenovo', 'HP', 'Dell',
  ];
  const upper = name.toUpperCase();
  for (const brand of brands) {
    if (upper.includes(brand.toUpperCase())) return brand;
  }
  return 'Generica';
}

function inferStockFromText(value: string): StockStatus {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return 'unknown';
  if (normalized.includes('sin stock') || normalized.includes('agotado')) return 'out-of-stock';
  if (normalized.includes('stock bajo')) return 'low-stock';
  if (normalized.includes('stock medio') || normalized.includes('stock alto') || normalized.includes('disponible')) {
    return 'in-stock';
  }
  return 'unknown';
}

function isRateLimitError(payload: CloudflareContentResponse | null, responseStatus?: number): boolean {
  if (responseStatus === 429) return true;
  return Boolean(payload?.errors?.some((error) =>
    error.code === 2001 || cleanText(error.message).toLowerCase().includes('rate limit'),
  ));
}

async function renderPortalTechPage(path: string, signal?: AbortSignal): Promise<string> {
  const now = Date.now();
  const cached = renderedHtmlCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.html;
  }

  if (!isCloudflareBrowserRenderingConfigured()) {
    return '';
  }

  if (portalTechBackoffUntil > now) {
    return '';
  }

  const { accountId, apiToken } = getCloudflareCredentials();
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: normalizeAbsoluteUrl(path),
      gotoOptions: {
        waitUntil: 'networkidle0',
        timeout: CLOUDFLARE_RENDER_TIMEOUT_MS,
      },
    }),
    signal,
  });

  const payload = await response.json().catch(() => null) as CloudflareContentResponse | null;

  if (!response.ok || !payload?.success || typeof payload.result !== 'string') {
    if (isRateLimitError(payload, response.status)) {
      portalTechBackoffUntil = now + PORTALTECH_BACKOFF_MS;
    }
    const errorMessage = payload?.errors?.map((error) => error.message).filter(Boolean).join(' | ') || `HTTP ${response.status}`;
    throw new Error(`portaltech render failed: ${errorMessage}`);
  }

  renderedHtmlCache.set(path, {
    expiresAt: now + PORTALTECH_HTML_CACHE_TTL_MS,
    html: payload.result,
  });

  return payload.result;
}

function matchesQuery(name: string, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;

  const haystack = normalizeSearchValue(name);
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  if (tokens.length === 1) return matched === 1;
  if (tokens.length === 2) return matched === 2;
  return matched >= Math.ceil(tokens.length * 0.7);
}

function matchesRequestedCategory(name: string, category: HardwareCategory): boolean {
  return inferCategoryFromTitle(name) === category;
}

function parsePortalTechListing(html: string, category: HardwareCategory, query?: string): Product[] {
  if (!html) return [];

  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seenIds = new Set<string>();

  $('.carta-producto').each((_, element) => {
    const card = $(element);
    const linkRaw =
      card.find('a[href*="producto/"]').first().attr('href')
      || card.find('meta[itemprop="url"]').attr('content')
      || '';
    if (!linkRaw) return;

    const productUrl = normalizeAbsoluteUrl(linkRaw);
    const slug = slugFromProductUrl(productUrl);
    if (!slug) return;

    const name =
      cleanText(card.find('meta[itemprop="name"]').attr('content'))
      || cleanText(card.find('.descripcion-producto').first().text());
    if (!name) return;

    if (!matchesRequestedCategory(name, category)) return;
    if (query && !matchesQuery(name, query)) return;

    const id = `portaltech-${slug}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const price =
      parseArsPrice(card.find('meta[itemprop="price"]').attr('content'))
      || parseArsPrice(card.find('.contenedor-carta-campo-3 > div div').first().text());
    if (price <= 0) return;

    const originalPrice = parseArsPrice(card.find('.precio-producto').last().text());
    const imageRaw =
      card.find('.imagen-producto img').first().attr('src')
      || card.find('meta[itemprop="image"]').attr('content')
      || '';
    const image = imageRaw && !imageRaw.endsWith('/NAN')
      ? normalizeAbsoluteUrl(imageRaw)
      : undefined;
    const stock = inferStockFromText(card.find('.badge').first().text());

    products.push({
      id,
      name,
      category,
      brand: cleanText(card.find('meta[itemprop="brand"]').attr('content')) || extractBrand(name),
      model: name,
      description: name,
      image,
      lowestPrice: price,
      highestPrice: price,
      averagePrice: price,
      prices: [
        {
          storeId: 'portaltech',
          storeName: 'Portal Tech',
          url: productUrl,
          price,
          originalPrice: originalPrice > price ? originalPrice : undefined,
          installment: null,
          stock,
          lastUpdated: new Date(),
        },
      ],
      specs: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  return products;
}

function buildSearchPath(query: string): string {
  return `/buscar/${encodeURIComponent(query.trim())}`;
}

async function fetchPortalTechDetailPage(slug: string, signal?: AbortSignal): Promise<Product | null> {
  const response = await fetch(normalizeAbsoluteUrl(`/producto/${slug}`), {
    headers: DETAIL_HEADERS,
    signal,
  });
  if (!response.ok) return null;

  const html = await response.text();
  const $ = cheerio.load(html);
  const title =
    cleanText($('h2.descripcion-producto').first().text())
    || cleanText($(`meta[itemprop="url"][content*="/producto/${slug}"]`).closest('[itemtype="http://schema.org/Product"]').find('meta[itemprop="name"]').attr('content'));
  if (!title) return null;

  const priceBox = $('.info-producto-disponible').first();
  const cashPrice =
    parseArsPrice(priceBox.find('meta[itemprop="price"]').attr('content'))
    || parseArsPrice(priceBox.find('.precio-producto').first().text());
  if (cashPrice <= 0) return null;

  const listPrice = parseArsPrice(priceBox.find('.precio-producto').last().text());
  const stock = inferStockFromText(priceBox.find('.badge').first().text());
  const imageRaw =
    $('.contenedor-imagen-principal img').first().attr('src')
    || '';
  const schemaScope = $(`[itemtype="http://schema.org/Product"]`).filter((_, element) =>
    $(element).find(`meta[itemprop="url"][content*="/producto/${slug}"]`).length > 0,
  ).first();
  const description =
    cleanText(schemaScope.find('meta[itemprop="description"]').attr('content'))
    || title;

  return {
    id: `portaltech-${slug}`,
    name: title,
    category: inferCategoryFromTitle(title),
    brand: cleanText(schemaScope.find('meta[itemprop="brand"]').attr('content')) || extractBrand(title),
    model: title,
    description,
    image: imageRaw ? normalizeAbsoluteUrl(imageRaw) : undefined,
    lowestPrice: cashPrice,
    highestPrice: cashPrice,
    averagePrice: cashPrice,
    prices: [
      {
        storeId: 'portaltech',
        storeName: 'Portal Tech',
        url: normalizeAbsoluteUrl(`/producto/${slug}`),
        price: cashPrice,
        originalPrice: listPrice > cashPrice ? listPrice : undefined,
        installment: null,
        stock,
        lastUpdated: new Date(),
      },
    ],
    specs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function inferCategoryFromTitle(value: string): HardwareCategory {
  const normalized = normalizeSearchValue(value);
  if (normalized.includes('placa de video') || normalized.includes('rtx') || normalized.includes('radeon')) {
    return 'tarjetas-graficas';
  }
  if (normalized.includes('mother')) return 'motherboards';
  if (normalized.includes('ram') || normalized.includes('memoria')) return 'memoria-ram';
  if (normalized.includes('ssd') || normalized.includes('disco')) return 'almacenamiento';
  if (normalized.includes('fuente')) return 'fuentes-alimentacion';
  if (normalized.includes('gabinete')) return 'gabinetes';
  if (normalized.includes('cooler') || normalized.includes('refrigeracion')) return 'refrigeracion';
  if (normalized.includes('monitor') || normalized.includes('mouse') || normalized.includes('teclado') || normalized.includes('auricular')) {
    return 'perifericos';
  }
  return 'procesadores';
}

export async function fetchPortalTechProducts(query: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const html = await renderPortalTechPage(buildSearchPath(trimmedQuery), signal);
  return parsePortalTechListing(html, category, trimmedQuery);
}

export async function fetchPortalTechCategory(category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const terms = CATEGORY_SEARCH_TERMS[category] ?? [];
  const merged = new Map<string, Product>();

  for (const term of terms) {
    const products = await fetchPortalTechProducts(term, category, signal).catch(() => [] as Product[]);
    for (const product of products) {
      if (!merged.has(product.id)) merged.set(product.id, product);
    }
    if (merged.size >= 18) break;
  }

  return Array.from(merged.values());
}

export async function fetchPortalTechProductById(id: string, signal?: AbortSignal): Promise<Product | null> {
  const normalized = id.trim().toLowerCase();
  if (!normalized.startsWith('portaltech-')) return null;

  const slug = normalized.slice('portaltech-'.length).trim();
  if (!slug) return null;

  return fetchPortalTechDetailPage(slug, signal);
}
