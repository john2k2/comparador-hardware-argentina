import type { User } from '@supabase/supabase-js';

export function resolveSafeNextPath(
  rawNext: string | null | undefined,
  fallback = '/',
): string {
  if (!rawNext) return fallback;

  let decoded = rawNext;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  if (!decoded.startsWith('/')) return fallback;
  if (decoded.startsWith('//')) return fallback;
  if (decoded.startsWith('/auth/callback')) return fallback;

  return decoded;
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return '';

  const metadataName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : '';
  if (metadataName) return metadataName;

  const emailName = (user.email ?? '').split('@')[0]?.trim();
  if (emailName) return emailName;

  return 'Usuario';
}
