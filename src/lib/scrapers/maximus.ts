import { HardwareCategory, Product } from '../types';
import { logger } from '../logger';

const MAXIMUS_BASE_URL = 'https://www.maximus.com.ar';
const MAXIMUS_SEARCH_SCRIPT = 'web.MAX.GetItemList4Search_v3';
const MAXIMUS_PAGE_METHOD_URL = `${MAXIMUS_BASE_URL}/wfmWebSite2.aspx/wsNRW_Script`;

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

interface MaximusScriptEnvelope {
  d?: string;
}

interface MaximusItem {
  item_id?: number | string;
  item_code4web?: string;
  item_desc?: string;
  item_desc4link?: string;
  prli_price?: string | number;
  prli_price_original?: number | string;
  item_outlet?: boolean;
}

interface MaximusSearchData {
  items?: MaximusItem[];
}

interface MaximusScriptResponse {
  scName?: string;
  data?: MaximusSearchData;
}

function parseWebsiteIdFromHtml(html: string): string | null {
  const match = html.match(/id="hidWebSiteID"\s+value="([^"]+)"/i);
  if (!match?.[1]) return null;
  return match[1].trim() || null;
}

function getSetCookies(headers: Headers): string[] {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extendedHeaders.getSetCookie === 'function') {
    return extendedHeaders.getSetCookie();
  }

  const raw = headers.get('set-cookie');
  if (!raw) return [];

  return raw
    .split(/,(?=[^;,=\s]+=[^;,]+)/g)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function buildCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
}

function parseArsPrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  const text = String(value ?? '').trim();
  if (!text) return 0;

  const digits = text.replace(/\D/g, '');
  return parseInt(digits, 10) || 0;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function extractBrandFromName(name: string): string {
  const brands = [
    'AMD',
    'Intel',
    'NVIDIA',
    'ASUS',
    'MSI',
    'Gigabyte',
    'ASRock',
    'Kingston',
    'Corsair',
    'G.Skill',
    'Samsung',
    'WD',
    'Seagate',
    'Crucial',
    'Patriot',
    'XPG',
    'Thermaltake',
    'Cooler Master',
    'be quiet!',
    'Noctua',
    'Arctic',
    'Sapphire',
    'PowerColor',
    'Zotac',
  ];
  const upper = name.toUpperCase();
  for (const brand of brands) {
    if (upper.includes(brand.toUpperCase())) return brand;
  }
  return 'Generica';
}

function buildMaximusSearchUrl(query: string): string {
  return `${MAXIMUS_BASE_URL}/Productos/maximus.aspx?/CAT=-1/SCAT=-1/M=-1/BUS=${encodeURIComponent(query)}/OR=1/PAGE=1/`;
}

async function fetchMaximusItems(query: string, signal?: AbortSignal): Promise<MaximusItem[]> {
  const searchUrl = buildMaximusSearchUrl(query);
  const pageRes = await fetch(searchUrl, {
    headers: SCRAPE_HEADERS,
    signal,
  });
  if (!pageRes.ok) throw new Error(`Error HTTP page: ${pageRes.status}`);

  const pageHtml = await pageRes.text();
  const websiteId = parseWebsiteIdFromHtml(pageHtml);
  if (!websiteId) throw new Error('No se pudo resolver hidWebSiteID');

  const cookieHeader = buildCookieHeader(getSetCookies(pageRes.headers));
  const params = {
    ws_id: websiteId,
    comp_id: 1,
    prli_id: 17,
    cust_id: -1,
    page: 1,
    cat_id: -1,
    subcat_id: -1,
    brand_id: -1,
    local: 0,
    search: query,
    order: 1,
    price_min: '',
    price_max: '',
    wco_tV: [] as Array<{ wco_id: number; tV: string }>,
  };

  const scriptRes = await fetch(MAXIMUS_PAGE_METHOD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: MAXIMUS_BASE_URL,
      Referer: searchUrl,
      'User-Agent': SCRAPE_HEADERS['User-Agent'],
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({
      guidWS_Id: websiteId,
      strScriptLabel: MAXIMUS_SEARCH_SCRIPT,
      JSonParameters: JSON.stringify(params),
    }),
    signal,
  });

  if (!scriptRes.ok) throw new Error(`Error HTTP api: ${scriptRes.status}`);

  const envelope = (await scriptRes.json()) as MaximusScriptEnvelope;
  if (!envelope?.d || typeof envelope.d !== 'string') return [];
  if (!envelope.d.trim().startsWith('{')) return [];

  const scriptPayload = JSON.parse(envelope.d) as MaximusScriptResponse;
  const items = scriptPayload.data?.items;
  return Array.isArray(items) ? items : [];
}

export async function fetchMaximusProducts(
  query: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const searchQuery = query.trim();
  if (!searchQuery) return [];

  try {
    logger.info(`[Maximus Scraper] Extrayendo productos para: ${searchQuery}`);
    const items = await fetchMaximusItems(searchQuery, signal);
    const products: Product[] = [];
    const seenIds = new Set<string>();

    for (const item of items) {
      const itemId = Number(item.item_id);
      const name = (item.item_desc ?? '').trim();
      if (!Number.isFinite(itemId) || !name) continue;

      const price = parseArsPrice(item.prli_price_original ?? item.prli_price);
      if (price <= 0) continue;

      const linkSlugRaw = item.item_desc4link || name;
      const linkSlug = slugify(linkSlugRaw);
      const id = `maximus-${itemId}-${linkSlug}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const productUrl = `${MAXIMUS_BASE_URL}/Producto/${linkSlugRaw}/ITEM=${itemId}/maximus.aspx?PN=${encodeURIComponent(item.item_code4web ?? '')}`;
      const image = item.item_code4web
        ? `${MAXIMUS_BASE_URL}/Temp/App_WebSite/App_PictureFiles/Items/${item.item_code4web}_600.jpg`
        : undefined;

      products.push({
        id,
        name,
        category: categorySlug,
        brand: extractBrandFromName(name),
        model: name,
        description: name,
        image,
        lowestPrice: price,
        highestPrice: price,
        averagePrice: price,
        prices: [
          {
            storeId: 'maximus',
            storeName: 'Maximus',
            url: productUrl,
            price,
            installment: null,
            stock: item.item_outlet ? 'low-stock' : 'in-stock',
            lastUpdated: new Date(),
          },
        ],
        specs: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    logger.info(`[Maximus Scraper] Productos detectados: ${products.length}`);
    return products;
  } catch (error) {
    logger.error('[Maximus Scraper] Error', { error });
    return [];
  }
}
