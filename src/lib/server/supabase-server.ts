import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabasePublishableKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || ''
).trim();
const supabaseSecretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let warnedReadFallback = false;
let warnedLegacyPublishableFallback = false;
let warnedLegacyServiceFallback = false;
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

  if (!supabaseUrl || !supabasePublishableKey) {
    cachedReadClient = null;
    return cachedReadClient;
  }

  if (
    !process.env.SUPABASE_PUBLISHABLE_KEY
    && !process.env.SUPABASE_ANON_KEY
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    && !warnedReadFallback
  ) {
    warnedReadFallback = true;
    console.warn('[Supabase Server] Using NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fallback on server. Prefer SUPABASE_PUBLISHABLE_KEY.');
  }

  if (
    !process.env.SUPABASE_PUBLISHABLE_KEY
    && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    && !warnedLegacyPublishableFallback
  ) {
    warnedLegacyPublishableFallback = true;
    console.warn('[Supabase Server] Using legacy anon key fallback. Prefer SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  cachedReadClient = createClient(supabaseUrl, supabasePublishableKey, baseClientOptions());
  return cachedReadClient;
}

export function getServerSupabaseServiceClient(): SupabaseClient | null {
  if (cachedServiceClient !== undefined) return cachedServiceClient;

  if (!supabaseUrl || !supabaseSecretKey) {
    if (!supabaseSecretKey && !warnedServiceMissing) {
      warnedServiceMissing = true;
      console.warn('[Supabase Server] SUPABASE_SECRET_KEY is missing. Server write operations will be disabled.');
    }

    cachedServiceClient = null;
    return cachedServiceClient;
  }

  if (!process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && !warnedLegacyServiceFallback) {
    warnedLegacyServiceFallback = true;
    console.warn('[Supabase Server] Using legacy SUPABASE_SERVICE_ROLE_KEY fallback. Prefer SUPABASE_SECRET_KEY.');
  }

  cachedServiceClient = createClient(supabaseUrl, supabaseSecretKey, baseClientOptions());
  return cachedServiceClient;
}
