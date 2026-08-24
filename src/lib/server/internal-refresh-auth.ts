import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const INTERNAL_REFRESH_HEADER = 'x-internal-refresh';

export function getInternalRefreshSecret(): string {
  return (
    process.env.INTERNAL_REFRESH_SECRET
    || process.env.CATALOG_REFRESH_CRON_SECRET
    || process.env.CRON_SECRET
    || ''
  ).trim();
}

export function buildInternalRefreshHeaders(): Record<string, string> {
  const secret = getInternalRefreshSecret();
  if (!secret) return {};
  return { [INTERNAL_REFRESH_HEADER]: secret };
}

export function isTrustedInternalRefreshRequest(request: NextRequest): boolean {
  const secret = getInternalRefreshSecret();
  if (!secret) return false;

  const provided = request.headers.get(INTERNAL_REFRESH_HEADER)?.trim() ?? '';
  return timingSafeEqualStrings(provided, secret);
}

function timingSafeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(rightBuffer, rightBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
