import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let warnedReadFallback = false;
let warnedServiceMissing = false;

let cachedReadClient: SupabaseClient | null | undefined;
let cachedServiceClient: SupabaseClient | null | undefined;

function baseClientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  } as const;
}

export function getServerSupabaseReadClient(): SupabaseClient | null {
  if (cachedReadClient !== undefined) return cachedReadClient;

  if (!supabaseUrl || !supabaseAnonKey) {
    cachedReadClient = null;
    return cachedReadClient;
  }

  if (!process.env.SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !warnedReadFallback) {
    warnedReadFallback = true;
    console.warn('[Supabase Server] Using NEXT_PUBLIC_SUPABASE_ANON_KEY fallback on server. Prefer SUPABASE_ANON_KEY.');
  }

  cachedReadClient = createClient(supabaseUrl, supabaseAnonKey, baseClientOptions());
  return cachedReadClient;
}

export function getServerSupabaseServiceClient(): SupabaseClient | null {
  if (cachedServiceClient !== undefined) return cachedServiceClient;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    if (!supabaseServiceRoleKey && !warnedServiceMissing) {
      warnedServiceMissing = true;
      console.warn('[Supabase Server] SUPABASE_SERVICE_ROLE_KEY is missing. Server write operations will be disabled.');
    }

    cachedServiceClient = null;
    return cachedServiceClient;
  }

  cachedServiceClient = createClient(supabaseUrl, supabaseServiceRoleKey, baseClientOptions());
  return cachedServiceClient;
}
