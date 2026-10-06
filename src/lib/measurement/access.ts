import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';

export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie, Authorization' };
export const privateJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_HEADERS });

export async function authorizeMeasurementRequest(request: NextRequest) {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : request.cookies.get('sb-access-token')?.value ?? null;
  return resolveAdminAccessFromToken(token);
}
export function hasSameOrigin(request: NextRequest) {
  const expected = new URL(request.url);
  const host = request.headers.get('host');
  if (host) expected.host = host;
  return request.headers.get('origin') === expected.origin;
}
export async function readBoundedJson(request: Request | Response, maximum = 16_384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Falta la solicitud.');
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maximum) { await reader.cancel(); throw new Error('La solicitud supera el tamaño permitido.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
