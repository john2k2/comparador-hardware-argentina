import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  INTERNAL_REFRESH_HEADER,
  buildInternalRefreshHeaders,
  isTrustedInternalRefreshRequest,
} from './internal-refresh-auth';

describe('internal-refresh-auth', () => {
  const clearSecrets = () => {
    delete process.env.INTERNAL_REFRESH_SECRET;
    delete process.env.CATALOG_REFRESH_CRON_SECRET;
    delete process.env.CRON_SECRET;
  };

  beforeEach(clearSecrets);
  afterEach(clearSecrets);

  it('rejects a spoofable x-internal-refresh: 1 even if a secret is configured', () => {
    process.env.CRON_SECRET = 'cron-secret-value-at-least-32-chars!!';
    const request = new NextRequest('http://localhost/api/search?q=ryzen&bypassDb=1', {
      headers: { [INTERNAL_REFRESH_HEADER]: '1' },
    });

    expect(isTrustedInternalRefreshRequest(request)).toBe(false);
  });

  it('rejects bypass traffic when no internal secret is configured', () => {
    const request = new NextRequest('http://localhost/api/search?q=ryzen&bypassDb=1', {
      headers: { [INTERNAL_REFRESH_HEADER]: '1' },
    });

    expect(isTrustedInternalRefreshRequest(request)).toBe(false);
    expect(buildInternalRefreshHeaders()[INTERNAL_REFRESH_HEADER]).toBeUndefined();
  });

  it('accepts the header only when it matches the configured secret', () => {
    process.env.INTERNAL_REFRESH_SECRET = 'internal-refresh-secret-32-chars!!';
    const headers = buildInternalRefreshHeaders();
    const request = new NextRequest('http://localhost/api/search?q=ryzen&bypassDb=1', {
      headers,
    });

    expect(headers[INTERNAL_REFRESH_HEADER]).toBe('internal-refresh-secret-32-chars!!');
    expect(isTrustedInternalRefreshRequest(request)).toBe(true);
  });
});
