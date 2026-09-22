import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStableRuntimeMode, shouldSkipLiveScraping } from './runtime-flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shouldSkipLiveScraping', () => {
  it('desactivar scraping no habilita productos de prueba en producción', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '1');
    vi.stubEnv('E2E_STABLE_MODE', '');
    vi.stubEnv('CI_E2E', '');

    expect(shouldSkipLiveScraping()).toBe(true);
    expect(shouldSkipLiveScraping({ internalRefresh: true })).toBe(true);
    expect(isStableRuntimeMode()).toBe(false);
  });

  it('reserva los datos de prueba para el modo E2E explícito', () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    expect(isStableRuntimeMode()).toBe(true);
    expect(shouldSkipLiveScraping()).toBe(true);
  });

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
