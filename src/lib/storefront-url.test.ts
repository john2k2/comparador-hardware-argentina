import { describe, expect, it } from 'vitest';
import { resolveTrustedStorefrontRedirect } from '@/lib/storefront-url';

describe('resolveTrustedStorefrontRedirect', () => {
  it('resolves relative redirects that remain on an approved storefront', () => {
    expect(resolveTrustedStorefrontRedirect('/producto/123', 'https://www.mexx.com.ar/buscar')).toBe(
      'https://www.mexx.com.ar/producto/123',
    );
  });

  it('rejects redirects to unknown or local hosts', () => {
    expect(resolveTrustedStorefrontRedirect('https://example.com/track', 'https://www.mexx.com.ar/buscar')).toBeNull();
    expect(resolveTrustedStorefrontRedirect('http://127.0.0.1/admin', 'https://www.mexx.com.ar/buscar')).toBeNull();
  });
});
