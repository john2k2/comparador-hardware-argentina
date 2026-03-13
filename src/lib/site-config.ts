const DEFAULT_SITE_URL = 'https://comparador-hardware.com.ar';
const DEFAULT_SITE_NAME = 'Comparador Hardware Argentina';

function normalizeSiteUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const SITE_URL = normalizeSiteUrl(process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL) ?? DEFAULT_SITE_URL;
export const SITE_NAME = DEFAULT_SITE_NAME;
export const GOOGLE_SITE_VERIFICATION = normalizeText(
  process.env.GOOGLE_SITE_VERIFICATION ?? process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
);
export const SUPPORT_EMAIL = normalizeText(process.env.SUPPORT_EMAIL ?? process.env.NEXT_PUBLIC_SUPPORT_EMAIL);

export function buildMailtoHref(subject?: string): string | null {
  if (!SUPPORT_EMAIL) return null;
  if (!subject) return `mailto:${SUPPORT_EMAIL}`;

  const params = new URLSearchParams({ subject });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
