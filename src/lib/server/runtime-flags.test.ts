import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldSkipLiveScraping } from './runtime-flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shouldSkipLiveScraping', () => {
  it('keeps production public requests on the persisted catalog by default', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '');
    vi.stubEnv('ENABLE_PUBLIC_LIVE_SCRAPING', '');

    expect(shouldSkipLiveScraping()).toBe(true);
  });

  it('permits authenticated refresh and admin bypass in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '');

    expect(shouldSkipLiveScraping({ internalRefresh: true })).toBe(false);
    expect(shouldSkipLiveScraping({ privilegedBypass: true })).toBe(false);
  });

  it('honors the explicit public live-scraping emergency flag', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '');
    vi.stubEnv('ENABLE_PUBLIC_LIVE_SCRAPING', '1');

    expect(shouldSkipLiveScraping()).toBe(false);
  });
});
