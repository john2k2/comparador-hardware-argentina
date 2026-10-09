import 'server-only';
import { getHomeSectionsData } from './home-sections';
import { decodeObservedHome, PUBLIC_HOME_KEY, PUBLIC_HOME_SCOPE } from './observed-snapshot';
import { getServerSupabaseReadClient, getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

export async function saveObservedHomeSnapshot() {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('Falta el guardado del corte público.');
  // El cliente de escritura no configura al lector público. Sin él, la lectura
  // devuelve [] y antes sobrescribíamos una selección válida con un falso vacío.
  if (!getServerSupabaseReadClient()) throw new Error('Falta la lectura del catálogo público.');
  const data = await getHomeSectionsData();
  const collectedAt = new Date().toISOString();
  const snapshot = decodeObservedHome({ kind: 'public-home', data: { collectedAt, latestOfferProducts: data.latestOfferProducts, priceDropProducts: data.priceDropProducts, priceDropFallbackUsed: data.priceDropFallbackUsed } });
  if (!snapshot) throw new Error('El corte público no es válido.');
  // Guardar sólo campos y ofertas públicos elegibles; jamás productos de relleno.
  const payload = { kind: 'public-home', data: snapshot };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 60_000) throw new Error('El corte público supera el tamaño permitido.');
  const { error } = await client.from('measurement_dashboard_entries').upsert({ entry_key: PUBLIC_HOME_KEY, scope: PUBLIC_HOME_SCOPE, payload, updated_at: collectedAt }, { onConflict: 'entry_key' }).abortSignal(AbortSignal.timeout(8_000));
  if (error) throw new Error('No se pudo guardar el corte público.');
  return collectedAt;
}
