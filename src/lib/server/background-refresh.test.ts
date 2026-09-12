import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { shouldScheduleInternalBackgroundRefresh } from './background-refresh';

describe('background refresh', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    vi.stubEnv('DISABLE_INTERNAL_BACKGROUND_REFRESH', '');
    vi.stubEnv('ENABLE_INTERNAL_BACKGROUND_REFRESH', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays off by default so public requests do not start recursive scraping', () => {
    expect(shouldScheduleInternalBackgroundRefresh(new NextRequest('https://example.com/api/search?q=rtx'))).toBe(false);
  });

  it('requires an explicit opt-in and never schedules from a trusted refresh request', () => {
    vi.stubEnv('ENABLE_INTERNAL_BACKGROUND_REFRESH', '1');
    expect(shouldScheduleInternalBackgroundRefresh(new NextRequest('https://example.com/api/search?q=rtx'))).toBe(true);

    vi.stubEnv('INTERNAL_REFRESH_SECRET', 'test-refresh-secret');
    expect(shouldScheduleInternalBackgroundRefresh(new NextRequest('https://example.com/api/search?q=rtx', {
      headers: { 'x-internal-refresh': 'test-refresh-secret' },
    }))).toBe(false);
  });
});
