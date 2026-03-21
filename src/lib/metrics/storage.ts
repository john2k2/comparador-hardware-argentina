import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import type { StoreScrapeEvent, EndpointRequestEvent, OperationalTelemetryState } from './types';
import type { PersistedEntryRow } from './types';
import {
  STORE_EVENT_LIMIT,
  ENDPOINT_EVENT_LIMIT,
  STORE_SCOPE,
  ENDPOINT_SCOPE,
  PERSISTED_EVENT_TTL_MS,
} from './constants';
import { normalizeStoreEvent, normalizeEndpointEvent, buildEventKey } from './utils';

export { STORE_SCOPE, ENDPOINT_SCOPE };

async function persistTelemetryEntry(scope: string, cacheKey: string, payload: StoreScrapeEvent | EndpointRequestEvent): Promise<void> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

  const expiresAt = new Date(Date.now() + PERSISTED_EVENT_TTL_MS).toISOString();
  await supabase
    .from('api_cache_entries')
    .upsert({
      cache_key: cacheKey,
      scope,
      payload,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'cache_key',
    });
}

export async function readPersistedTelemetryState(nowMs = Date.now()): Promise<OperationalTelemetryState | null> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return null;

  const nowIso = new Date(nowMs).toISOString();
  const [storeRows, endpointRows] = await Promise.all([
    supabase
      .from('api_cache_entries')
      .select('payload')
      .eq('scope', STORE_SCOPE)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .limit(STORE_EVENT_LIMIT),
    supabase
      .from('api_cache_entries')
      .select('payload')
      .eq('scope', ENDPOINT_SCOPE)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .limit(ENDPOINT_EVENT_LIMIT),
  ]);

  if (storeRows.error && endpointRows.error) {
    return null;
  }

  return {
    storeEvents: ((storeRows.data ?? []) as PersistedEntryRow[])
      .map((row) => normalizeStoreEvent(row.payload))
      .filter((event): event is StoreScrapeEvent => Boolean(event))
      .sort((a, b) => a.finishedAtMs - b.finishedAtMs),
    endpointEvents: ((endpointRows.data ?? []) as PersistedEntryRow[])
      .map((row) => normalizeEndpointEvent(row.payload))
      .filter((event): event is EndpointRequestEvent => Boolean(event))
      .sort((a, b) => a.finishedAtMs - b.finishedAtMs),
  };
}

export function mergeState(preferred: OperationalTelemetryState, fallback: OperationalTelemetryState): OperationalTelemetryState {
  const mergedStoreEvents = [...fallback.storeEvents];
  const storeKeys = new Set(mergedStoreEvents.map((event) => buildEventKey(STORE_SCOPE, event, event.storeId)));

  for (const event of preferred.storeEvents) {
    const key = buildEventKey(STORE_SCOPE, event, event.storeId);
    if (storeKeys.has(key)) continue;
    mergedStoreEvents.push(event);
    storeKeys.add(key);
  }

  const mergedEndpointEvents = [...fallback.endpointEvents];
  const endpointKeys = new Set(mergedEndpointEvents.map((event) => buildEventKey(ENDPOINT_SCOPE, event, String(event.statusCode))));

  for (const event of preferred.endpointEvents) {
    const key = buildEventKey(ENDPOINT_SCOPE, event, String(event.statusCode));
    if (endpointKeys.has(key)) continue;
    mergedEndpointEvents.push(event);
    endpointKeys.add(key);
  }

  mergedStoreEvents.sort((a, b) => a.finishedAtMs - b.finishedAtMs);
  mergedEndpointEvents.sort((a, b) => a.finishedAtMs - b.finishedAtMs);

  return {
    storeEvents: mergedStoreEvents.slice(-STORE_EVENT_LIMIT),
    endpointEvents: mergedEndpointEvents.slice(-ENDPOINT_EVENT_LIMIT),
  };
}

export { persistTelemetryEntry };
