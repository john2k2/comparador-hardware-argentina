import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchEnebaSnapshot } from './fetch';
import { ENEBA_PRICE_MAX_AGE_MS, readEnebaSnapshot, type EnebaSnapshot } from './pilot';
import { ENEBA_CACHE_SCOPE, ENEBA_CACHE_KEY } from './snapshot-cache';
export async function persistEnebaSnapshot(client: SupabaseClient, input: EnebaSnapshot) {
  const snapshot = readEnebaSnapshot(input);
  if (!snapshot || !['ready', 'empty'].includes(snapshot.status) || !snapshot.feedUpdatedAt || !snapshot.fetchedAt
    || Date.parse(snapshot.fetchedAt) > Date.now()
    || !isDeepStrictEqual(snapshot.offers, input.offers)) throw new Error('ENEBA_SNAPSHOT_INVALID');
  const expires = Date.parse(snapshot.feedUpdatedAt) + ENEBA_PRICE_MAX_AGE_MS;
  if (expires <= Date.now() || Date.parse(snapshot.feedUpdatedAt) > Date.now()) throw new Error('ENEBA_SNAPSHOT_EXPIRED');
  const expiresAt = new Date(expires).toISOString();
  const { error } = await client.from('api_cache_entries').upsert({
    cache_key: `${ENEBA_CACHE_SCOPE}:${ENEBA_CACHE_KEY}`, scope: ENEBA_CACHE_SCOPE,
    payload: snapshot, expires_at: expiresAt, updated_at: new Date().toISOString(),
  }, { onConflict: 'cache_key' });
  if (error) throw new Error('ENEBA_SNAPSHOT_PERSIST_FAILED');
  const check = await client.from('api_cache_entries').select('payload,expires_at')
    .eq('cache_key', `${ENEBA_CACHE_SCOPE}:${ENEBA_CACHE_KEY}`).single();
  if (check.error || !isDeepStrictEqual(readEnebaSnapshot(check.data?.payload), snapshot)
    || Date.parse(String(check.data?.expires_at)) !== expires) throw new Error('ENEBA_SNAPSHOT_READBACK_FAILED');
  return { status: snapshot.status, offers: snapshot.offers.length, fetchedAt: snapshot.fetchedAt, feedUpdatedAt: snapshot.feedUpdatedAt, expiresAt };
}
export async function refreshEnebaPilot(client: SupabaseClient) {
  const snapshot = await fetchEnebaSnapshot();
  if (snapshot.status === 'error') throw new Error('ENEBA_FEED_UNVERIFIED_PREVIOUS_SNAPSHOT_PRESERVED');
  return persistEnebaSnapshot(client, snapshot);
}
