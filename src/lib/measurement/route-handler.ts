import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { getMeasurementDashboard, executeMeasurementCommand } from './service';
import { parseCommand } from './validation';
import { logger } from '@/lib/logger';
import { CollectionRequestError } from './collection';

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie, Authorization' };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: HEADERS });
const recentSync = new Map<string, number>();

async function authorize(request: NextRequest) {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : request.cookies.get('sb-access-token')?.value ?? null;
  return resolveAdminAccessFromToken(token);
}

export async function handleMeasurementGet(request: NextRequest) {
  try {
    if (!await authorize(request)) return json({ error: 'No autorizado' }, 401);
    return json(await getMeasurementDashboard());
  } catch {
    logger.warn('No se pudo leer el panel privado de seguimiento');
    return json({ error: 'No se pudo obtener el seguimiento. Volvé a intentar.' }, 503);
  }
}

async function readCommand(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Falta la solicitud.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 65536) { await reader.cancel(); throw new Error('La lectura es demasiado grande. Usá sólo cifras resumidas.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('El archivo debe tener el formato JSON indicado.'); }
  return parseCommand(value);
}

export async function handleMeasurementPost(request: NextRequest) {
  try {
    const user = await authorize(request);
    if (!user) return json({ error: 'No autorizado' }, 401);
    // Sin excepciones por bearer: todas las escrituras del panel requieren el origen de esta página.
    const expectedUrl = new URL(request.url);
    // Next puede usar el hostname interno en request.url. Host conserva el destino del navegador.
    // No aceptar X-Forwarded-Host enviado por un cliente como un origen autorizado.
    const host = request.headers.get('host');
    if (host) expectedUrl.host = host;
    if (request.headers.get('origin') !== expectedUrl.origin) return json({ error: 'La solicitud debe salir desde esta página.' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Usá el formato JSON indicado.' }, 415);
    let command;
    try { command = await readCommand(request); } catch (error) { return json({ error: error instanceof Error ? error.message : 'La lectura no es válida.' }, 400); }
    if (command.action === 'sync') {
      const now = Date.now();
      if ((recentSync.get(user.id) ?? 0) > now - 30_000) return json({ error: 'Esperá 30 segundos entre actualizaciones.' }, 429);
      for (const [id, at] of recentSync) if (at < now - 30_000) recentSync.delete(id);
      recentSync.set(user.id, now);
    }
    return json(await executeMeasurementCommand(command));
  } catch (error) {
    if (error instanceof CollectionRequestError) return json({ error: error.message }, error.status);
    logger.warn('No se pudo guardar el seguimiento privado');
    return json({ error: 'No se pudo guardar el resultado. El historial no se actualizó; verificá la conexión privada y volvé a intentar.' }, 503);
  }
}
