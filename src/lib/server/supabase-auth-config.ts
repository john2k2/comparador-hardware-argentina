/** Mantiene cada URL de Auth con su clave pública; una pareja incompleta falla. */
export type SupabaseAuthEnvironment = {
  SUPABASE_AUTH_URL?: string;
  SUPABASE_AUTH_PUBLISHABLE_KEY?: string;
  SUPABASE_AUTH_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};
export function supabaseAuthConnection(env: SupabaseAuthEnvironment): { url: string; key: string } | null {
  const explicit = [(env.SUPABASE_AUTH_URL || '').trim(), (env.SUPABASE_AUTH_PUBLISHABLE_KEY || env.SUPABASE_AUTH_ANON_KEY || '').trim()];
  const browser = [(env.NEXT_PUBLIC_SUPABASE_URL || '').trim(), (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()];
  const [url, key] = explicit.some(Boolean) ? explicit : browser.some(Boolean) ? browser
    : [(env.SUPABASE_URL || '').trim(), (env.SUPABASE_PUBLISHABLE_KEY || '').trim()];
  return url && key ? { url, key } : null;
}
