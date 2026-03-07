import type { User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';

const ADMIN_AUTH_COOKIE_NAME = 'sb-access-token';

export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  const appMetadata = user.app_metadata ?? {};
  return appMetadata.is_admin === true || appMetadata.role === 'admin';
}

async function getUserByAccessToken(accessToken: string): Promise<User | null> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase || !accessToken) return null;

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

export async function resolveAdminAccessFromToken(accessToken: string | null): Promise<User | null> {
  if (!accessToken) return null;
  const user = await getUserByAccessToken(accessToken);
  if (!isAdminUser(user)) return null;
  return user;
}

export async function requireAdminPageAccess(nextPath = '/admin'): Promise<User> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_AUTH_COOKIE_NAME)?.value ?? null;
  const adminUser = await resolveAdminAccessFromToken(accessToken);

  if (!adminUser) {
    redirect(`/auth?next=${encodeURIComponent(nextPath)}`);
  }

  return adminUser;
}
