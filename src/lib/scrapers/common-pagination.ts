import * as cheerio from 'cheerio';

const NEXT_PAGE_SELECTORS = [
  'a[rel="next"]',
  'a.next',
  '.next a',
  '.pagination a',
  '.pager a',
  '.page-item a',
  '.page-numbers a',
  '.woocommerce-pagination a',
  'nav[aria-label*="pagination" i] a',
  'nav[aria-label*="pagin" i] a',
];

export function normalizeAbsoluteUrl(baseUrl: string, href: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  return `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
}

export function buildPaginatedUrl(rawUrl: string, page: number): string {
  const url = new URL(rawUrl);
  if (page <= 1) {
    url.searchParams.delete('page');
    url.searchParams.delete('paged');
    url.searchParams.delete('pagina');
    return url.toString();
  }

  url.searchParams.set('page', String(page));
  return url.toString();
}

function extractPageNumber(rawUrl: string): number | null {
  try {
    const url = new URL(rawUrl);
    const searchParams = url.searchParams;
    const direct = searchParams.get('page') || searchParams.get('paged') || searchParams.get('pagina');
    if (direct) {
      const parsed = Number(direct);
      if (Number.isFinite(parsed) && parsed >= 1) return Math.trunc(parsed);
    }

    const pathMatch = url.pathname.match(/\/page\/(\d+)\/?$/i);
    if (pathMatch?.[1]) {
      const parsed = Number(pathMatch[1]);
      if (Number.isFinite(parsed) && parsed >= 1) return Math.trunc(parsed);
    }
  } catch {
    return null;
  }

  return null;
}

function isNextPaginationLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === '>'
    || normalized === '>>'
    || normalized === 'siguiente'
    || normalized === 'sig'
    || normalized === 'next'
    || normalized === '›'
    || normalized === '»';
}

export function findNextPageUrl(
  $: cheerio.CheerioAPI,
  currentUrl: string,
  baseUrl: string,
): string | null {
  const currentPage = extractPageNumber(currentUrl) ?? 1;
  const candidates = new Set<string>();

  for (const selector of NEXT_PAGE_SELECTORS) {
    $(selector).each((_, anchor) => {
      const href = $(anchor).attr('href')?.trim() || '';
      const absolute = normalizeAbsoluteUrl(baseUrl, href);
      if (absolute) candidates.add(absolute);
    });
  }

  let bestByPageNumber: { url: string; page: number } | null = null;

  for (const candidate of candidates) {
    if (candidate === currentUrl) continue;

    const page = extractPageNumber(candidate);
    if (page !== null && page > currentPage) {
      if (!bestByPageNumber || page < bestByPageNumber.page) {
        bestByPageNumber = { url: candidate, page };
      }
    }
  }

  if (bestByPageNumber) return bestByPageNumber.url;

  for (const selector of NEXT_PAGE_SELECTORS) {
    const anchor = $(selector).filter((_, element) => {
      const text = $(element).text().replace(/\s+/g, ' ').trim();
      return isNextPaginationLabel(text);
    }).first();

    if (anchor.length > 0) {
      const href = anchor.attr('href')?.trim() || '';
      const absolute = normalizeAbsoluteUrl(baseUrl, href);
      if (absolute && absolute !== currentUrl) return absolute;
    }
  }

  return null;
}

export function resolvePaginationBudget(url: string, categoryPages: number, searchPages: number): number {
  const normalized = url.toLowerCase();
  if (
    normalized.includes('/buscar/')
    || normalized.includes('/resultados-busqueda')
    || normalized.includes('/cat/search/')
    || normalized.includes('?s=')
    || normalized.includes('&s=')
  ) {
    return searchPages;
  }

  return categoryPages;
}
