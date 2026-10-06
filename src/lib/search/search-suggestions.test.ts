import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSuggestionProductHref, createSuggestionLoader, isSuggestionQuery, moveSuggestionIndex, normalizeSuggestionQuery, parseSearchSuggestions } from './search-suggestions';

const item = { id: 'cpu-7', name: 'Ryzen 7', category: 'procesadores' };
const response = (query: string, suggestions: unknown = [item]) => new Response(JSON.stringify({ query, suggestions }));
afterEach(() => vi.useRealTimers());

describe('sugerencias del catálogo', () => {
  it('conserva una consulta de portada y sólo genera un regreso interno al buscador', () => {
    const href = new URL(buildSuggestionProductHref('cpu/7', 'Ryzen', new URL('https://site.invalid/?utm_source=qa&next=https://other.invalid')), 'https://site.invalid');
    expect(href.pathname).toBe('/product/cpu%2F7');
    const back = new URL(href.searchParams.get('from')!, 'https://site.invalid');
    expect(back.pathname).toBe('/search');
    expect(back.searchParams.get('q')).toBe('Ryzen');
    expect(back.searchParams.has('utm_source')).toBe(false);
    expect(back.searchParams.has('next')).toBe(false);
  });

  it('mantiene página, filtros y referencias si la consulta sigue siendo la misma', () => {
    const source = new URL('https://site.invalid/search?q=ryzen&category=procesadores&stores=venex,mexx&minPrice=100000&sortBy=price-desc&page=3&includeUnavailable=1');
    const href = new URL(buildSuggestionProductHref('cpu-7', 'Ryzen', source), source);
    const back = new URL(href.searchParams.get('from')!, source);
    expect(back.searchParams.get('page')).toBe('3');
    expect(back.searchParams.get('category')).toBe('procesadores');
    expect(back.searchParams.get('stores')).toBe('mexx,venex');
    expect(back.searchParams.get('minPrice')).toBe('100000');
    expect(back.searchParams.get('sortBy')).toBe('price-desc');
    expect(back.searchParams.get('includeUnavailable')).toBe('1');
  });

  it('vuelve a la primera página al abrir una sugerencia de una consulta nueva', () => {
    const source = new URL('https://site.invalid/search?q=Ryzen+5&page=9&sortBy=price-asc');
    const href = new URL(buildSuggestionProductHref('cpu-7', 'Ryzen 7', source), source);
    const back = new URL(href.searchParams.get('from')!, source);
    expect(back.searchParams.get('q')).toBe('Ryzen 7');
    expect(back.searchParams.has('page')).toBe(false);
    expect(back.searchParams.get('sortBy')).toBe('price-asc');
  });

  it('conserva la categoría de una landing cuyo filtro no aparece en la query', () => {
    const source = new URL('https://site.invalid/comparar/placas-de-video');
    const href = new URL(buildSuggestionProductHref('gpu-7', 'RTX 5090', source), source);
    const back = new URL(href.searchParams.get('from')!, source);
    expect(back.searchParams.get('category')).toBe('tarjetas-graficas');
    expect(back.searchParams.get('q')).toBe('RTX 5090');
  });

  it('acota consulta y respuesta sin exponer datos de precio no comprobados', () => {
    expect(normalizeSuggestionQuery('  Ryzen\n  7 ')).toBe('Ryzen 7');
    expect([isSuggestionQuery('ry'), isSuggestionQuery('ryzen'), isSuggestionQuery('a'.repeat(129))]).toEqual([false, true, false]);
    expect(parseSearchSuggestions([{ ...item, price: 12, stock: 'unknown' }, item, { ...item, id: 'other', category: 'invalid' }])).toEqual([item]);
    expect(parseSearchSuggestions(Array.from({ length: 20 }, (_, i) => ({ ...item, id: String(i) })))).toHaveLength(5);
  });

  it('maneja las flechas sin bloquear las teclas de edición', () => {
    expect(moveSuggestionIndex(-1, 'ArrowDown', 5)).toBe(0);
    expect(moveSuggestionIndex(-1, 'ArrowUp', 5)).toBe(4);
    expect(moveSuggestionIndex(4, 'ArrowDown', 5)).toBe(0);
    expect(moveSuggestionIndex(2, 'ArrowLeft', 5)).toBe(2);
    expect(moveSuggestionIndex(2, 'ArrowUp', 0)).toBe(-1);
  });

  it('usa caché breve y no pide consultas vacías o demasiado cortas', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response('ryzen'));
    const load = createSuggestionLoader(fetcher);
    const signal = new AbortController().signal;
    expect(await load('ry', signal)).toEqual([]);
    expect(await load('ryzen', signal)).toEqual([item]);
    expect(await load('ryzen', signal)).toEqual([item]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await load('ryzen', signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('una respuesta abortada no se promueve ni se guarda en caché', async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValue(response('ryzen'));
    const load = createSuggestionLoader(fetcher);
    const controller = new AbortController();
    const pending = load('ryzen', controller.signal);
    controller.abort(); resolve(response('ryzen'));
    expect(await pending).toEqual([]);
    expect(await load('ryzen', new AbortController().signal)).toEqual([item]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rechaza una respuesta de otra consulta o un fallo y permite reintentar', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response('intel'))
      .mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValue(response('ryzen'));
    const load = createSuggestionLoader(fetcher), signal = new AbortController().signal;
    expect(await load('ryzen', signal)).toEqual([]);
    await expect(load('ryzen', signal)).rejects.toThrow('no disponibles');
    expect(await load('ryzen', signal)).toEqual([item]);
  });
});
