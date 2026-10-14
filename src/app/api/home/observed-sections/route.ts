import { handleObservedHomeRead } from '@/lib/home/edge-read';
import { isCatalogSqlBackendEnabled } from '@/lib/catalog/catalog-backend';
import { getHomeSectionsData } from '@/lib/home/home-sections';
import { decodeObservedHome } from '@/lib/home/observed-snapshot';
export async function GET(request: Request) {
  if (isCatalogSqlBackendEnabled()) {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    try {
      const data = await getHomeSectionsData();
      // collectedAt fecha esta consulta; lastUpdated conserva la observación de
      // cada tienda. Consultar SQL no renueva precios, stock ni sus tres horas.
      const snapshot = decodeObservedHome({ kind: 'public-home', data: {
        collectedAt: new Date().toISOString(), latestOfferProducts: data.latestOfferProducts,
        priceDropProducts: data.priceDropProducts, priceDropFallbackUsed: data.priceDropFallbackUsed,
      } });
      if (!snapshot) throw new Error('HOME_SELECTION_INVALID');
      return Response.json(snapshot, { headers });
    } catch {
      return Response.json({ error: 'No se pudo consultar una selección reciente. Podés consultar el catálogo.', reason: 'selection-unavailable' }, { status: 503, headers });
    }
  }
  return await handleObservedHomeRead(request, {
    SUPABASE_URL: process.env.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }, fetch) ?? new Response(null, { status: 404 });
}
