import { NextRequest, NextResponse } from 'next/server';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { isStableRuntimeMode } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { isSuggestionQuery, normalizeSuggestionQuery, parseSearchSuggestions, SEARCH_SUGGESTION_TTL_MS, type SearchSuggestion } from './search-suggestions';

const cache = new Map<string, { at: number; items: SearchSuggestion[] }>();
const inFlight = new Map<string, Promise<SearchSuggestion[]>>();

async function readSuggestions(query: string): Promise<SearchSuggestion[]> {
  // La vista de pruebas debe sugerir las mismas fichas que sus páginas de detalle.
  if (isStableRuntimeMode()) return parseSearchSuggestions(getStableFixtureProducts({ query, sortBy: 'relevance' }));
  const cached = cache.get(query);
  if (cached && Date.now() - cached.at < SEARCH_SUGGESTION_TTL_MS) return cached.items;
  if (inFlight.has(query)) return inFlight.get(query)!;
  if (inFlight.size >= 20) throw new Error('Suggestion capacity reached');
  // Reutiliza exclusivamente el RPC de lectura. No ejecuta el buscador con refresh/demanda.
  const pending = readProductsPageFromDatabase({ query, page: 1, pageSize: 5, sortBy: 'relevance' })
    .then(({ products }) => {
      const items = parseSearchSuggestions(products);
      cache.delete(query);
      cache.set(query, { at: Date.now(), items });
      while (cache.size > 100) cache.delete(cache.keys().next().value!);
      return items;
    });
  inFlight.set(query, pending);
  try { return await pending; } finally { inFlight.delete(query); }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('q') ?? '';
  const query = normalizeSuggestionQuery(raw);
  if (raw.length > 256 || query.length > 128) return NextResponse.json({ error: 'Consulta demasiado larga' }, { status: 400 });
  if (!isSuggestionQuery(query)) return NextResponse.json({ query, suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const rate = await checkRateLimit(`search-suggestions:${getRequestIp(request)}`, { limit: 60, windowMs: 60_000 });
  const headers = { ...buildRateLimitHeaders(rate), 'Cache-Control': 'private, max-age=60' };
  if (!rate.allowed) return NextResponse.json({ error: 'Demasiadas consultas' }, { status: 429, headers: { ...headers, 'Cache-Control': 'no-store', 'Retry-After': String(rate.retryAfterSeconds) } });
  try { return NextResponse.json({ query, suggestions: await readSuggestions(query) }, { headers }); }
  catch { return NextResponse.json({ error: 'Sugerencias no disponibles' }, { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } }); }
}
