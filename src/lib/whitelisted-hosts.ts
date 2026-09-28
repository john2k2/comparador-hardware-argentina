import { IMAGE_DOMAINS } from '@/lib/image-domains';

// La validación y el CSP comparten los mismos hosts; sin una segunda lista
// que vuelva a bloquear una tienda autorizada para imágenes directas.
export const WHITELISTED_IMAGE_HOSTS = IMAGE_DOMAINS;

export function isImageHostWhitelisted(source: string): boolean {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return WHITELISTED_IMAGE_HOSTS.some((host) => host.startsWith('*.')
      ? url.hostname.endsWith(`.${host.slice(2)}`)
      : url.hostname === host);
  } catch {
    return false;
  }
}
