import { handleObservedHomeRead } from '@/lib/home/edge-read';
import { isCatalogSqlBackendEnabled } from '@/lib/catalog/catalog-backend';
import { getHomeSectionsData } from '@/lib/home/home-sections';
import { decodeObservedHome } from '@/lib/home/observed-snapshot';
import { readRecentOfferProducts } from '@/lib/persistence/recent-offer-products';
import { pickLatestOfferProducts } from '@/lib/home/latest-offers';
export async function GET(request: Request) {
  const nodeOrigin = process.env.CATALOG_NODE_ORIGIN === '1';
  if (isCatalogSqlBackendEnabled() || nodeOrigin) {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    try {
      // El origen Node consulta ofertas públicas; no recibe credenciales para
      // leer las entradas privadas de medición ni inventa bajas de precio.
      const data = nodeOrigin ? {
        latestOfferProducts: pickLatestOfferProducts(await readRecentOfferProducts()),
        priceDropProducts: [], priceDropFallbackUsed: true,
      } : await getHomeSectionsData();
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
