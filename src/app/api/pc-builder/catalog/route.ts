import { NextRequest, NextResponse } from 'next/server';
import { readBuilderCatalog } from '@/lib/pc-builder/catalog';
import { BUILD_SLOTS, type BuildSlot } from '@/lib/pc-builder/types';
import { checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';

export async function GET(request: NextRequest) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const slot = request.nextUrl.searchParams.get('slot');
  const ids = request.nextUrl.searchParams.getAll('id');
  if ((ids.length > 0 && (ids.length > 8 || ids.some((id) => !/^[\w.-]{1,240}$/.test(id))))
    || (!ids.length && !BUILD_SLOTS.includes(slot as BuildSlot))) return reply({ error: 'Selección inválida.' }, 400);
  const rate = await checkRateLimit(`pc-builder:${getRequestIp(request)}`, { limit: 90, windowMs: 60_000 });
  if (!rate.allowed) return reply({ error: 'Esperá unos segundos antes de volver a buscar.' }, 429);
  try {
    const products = await readBuilderCatalog({ ids: ids.length ? ids : undefined, slot: slot as BuildSlot,
      query: request.nextUrl.searchParams.get('q')?.slice(0, 80) });
    return reply({ products });
  } catch { return reply({ error: 'No pudimos cargar estas piezas. Volvé a intentarlo.' }, 503); }
}
