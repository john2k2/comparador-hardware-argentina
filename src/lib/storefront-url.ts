import { stores } from '@/lib/scrapers/static-data';

const STOREFRONT_HOSTS = new Set(
  stores.map((store) => new URL(store.url).hostname.replace(/^www\./, '').toLowerCase()),
);

export function isTrustedStorefrontUrl(value: string): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return STOREFRONT_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export function resolveTrustedStorefrontRedirect(location: string, currentUrl: string): string | null {
  try {
    const resolved = new URL(location, currentUrl).toString();
    return isTrustedStorefrontUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}
