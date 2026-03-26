import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import type { AccessMode } from '@/lib/admin/catalog-refresh/types';

export function isValidCronRequest(request: NextRequest): boolean {
  const cronSecret = (
    process.env.CATALOG_REFRESH_CRON_SECRET
    || process.env.CRON_SECRET
    || ''
  ).trim();

  if (!cronSecret) return false;

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization === `Bearer ${cronSecret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret')?.trim() ?? '';
  return headerSecret === cronSecret;
}

export async function ensureAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const cookieStore = await cookies();
  const tokenFromCookie = cookieStore.get('sb-access-token')?.value ?? null;
  return resolveAdminAccessFromToken(tokenFromHeader || tokenFromCookie);
}

export async function ensureAccess(request: NextRequest): Promise<AccessMode | null> {
  if (isValidCronRequest(request)) return 'cron';
  const admin = await ensureAdmin(request);
  return admin ? 'admin' : null;
}
