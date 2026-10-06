import 'server-only';
import { getHomeSectionsData } from './home-sections';
import { PUBLIC_HOME_KEY, PUBLIC_HOME_SCOPE } from './observed-snapshot';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

export async function saveObservedHomeSnapshot() {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('Falta el guardado del corte público.');
  const data = await getHomeSectionsData();
  const collectedAt = new Date().toISOString();
  const payload = { kind: 'public-home', data: { collectedAt, latestOfferProducts: data.latestOfferProducts, priceDropProducts: data.priceDropProducts, priceDropFallbackUsed: data.priceDropFallbackUsed } };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 60_000) throw new Error('El corte público supera el tamaño permitido.');
  const { error } = await client.from('measurement_dashboard_entries').upsert({ entry_key: PUBLIC_HOME_KEY, scope: PUBLIC_HOME_SCOPE, payload, updated_at: collectedAt }, { onConflict: 'entry_key' }).abortSignal(AbortSignal.timeout(8_000));
  if (error) throw new Error('No se pudo guardar el corte público.');
  return collectedAt;
}
