import 'server-only';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import type { ProviderId } from './types';

const WORKFLOW = 'https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/measurement-snapshot.yml';

export class CollectionRequestError extends Error {
  constructor(message: string, public readonly status = 503) { super(message); }
}

export function usesExternalCollector() {
  return process.env.MEASUREMENT_COLLECTION_MODE === 'external';
}

// Reutiliza el despachador existente, con destino fijo. No ejecuta proveedores
// ni acepta repositorios, ramas o tareas indicadas por el navegador.
export async function requestMeasurementCollection(provider: ProviderId | 'all') {
  const token = process.env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();
  const client = getServerSupabaseServiceClient();
  if (!token || !client) throw new CollectionRequestError('La actualización externa no está configurada. Se conserva la última lectura.');
  const { data, error } = await client.rpc('check_api_rate_limit', {
    p_bucket_key: 'measurement-collection-request', p_limit: 1, p_window_seconds: 300,
  }).abortSignal(AbortSignal.timeout(8_000));
  if (error || !data || typeof data.allowed !== 'boolean') throw new CollectionRequestError('No se pudo verificar el límite de actualización. Se conserva la última lectura.');
  if (!data.allowed) throw new CollectionRequestError('Esperá cinco minutos entre solicitudes de actualización. Podés recargar las lecturas guardadas.', 429);
  let response: Response;
  try {
    response = await fetch(`${WORKFLOW}/dispatches`, {
      method: 'POST', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'comparador-measurement-collector', 'X-GitHub-Api-Version': '2026-03-10' },
      body: JSON.stringify({ ref: 'main', inputs: { provider } }),
    });
  } catch { throw new CollectionRequestError('No se pudo solicitar la actualización. Se conserva la última lectura.'); }
  if (response.status !== 204) throw new CollectionRequestError('GitHub no confirmó la solicitud de actualización. Se conserva la última lectura.');
  return 'Actualización solicitada. La tarea se ejecuta fuera del servidor y puede tardar unos minutos. Pulsá «Recargar datos guardados» para ver el resultado; las cifras anteriores conservan su fecha.';
}
