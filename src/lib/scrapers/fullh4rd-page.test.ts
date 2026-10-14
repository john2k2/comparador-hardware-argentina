import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseFullh4rdPage } from './fullh4rd-page';
import { fetchFullh4rdProducts } from './fullh4rd';
const url = 'https://fullh4rd.com.ar/productos';
const card = `<article class="results-card"><h2><a href="/prod/28129/placa-de-video-geforce-rtx-3050-6gb-msi-lp-oc">PLACA DE VIDEO GeForce RTX 3050 6GB MSI LP OC</a></h2><div class="results-card__price-current">$497.849,99</div><div class="results-card__price-list">$547.634,98</div><button>Comprar</button></article>`;
describe('FullH4rd grilla pública observada', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('el lector sigue página 3 a 4 sin reescribirla como página 2', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      fetched.push(input);
      return new Response(fetched.length === 1
        ? card+'<a aria-label="Página siguiente" href="/productos?page=4"></a>'
        : card.replaceAll('28129','28130'));
    });
    const products = await fetchFullh4rdProducts(url+'?page=3','tarjetas-graficas');
    expect(fetched).toEqual([url+'?page=3',url+'?page=4']);
    expect(products).toHaveLength(2);
  });
  it('conserva centavos, identidad numérica y stock desconocido', () => {
    const date = new Date('2026-10-11T15:35:00Z');
    const result = parseFullh4rdPage(card, url, undefined, date);
    expect(result.products[0]).toMatchObject({id:'fh-28129',category:'tarjetas-graficas',lowestPrice:497849.99});
    expect(result.products[0].prices[0]).toMatchObject({stock:'unknown',priceCondition:'unspecified',lastUpdated:date});
  });
  it('respeta el siguiente enlace declarado y el total sin inventar páginas', () => {
    const result = parseFullh4rdPage(card+'<section aria-label="Paginación de resultados">Mostrando 1-12 de 1.897<a aria-label="Página siguiente" href="/productos?page=2"></a></section>', url);
    expect(result.nextUrl).toBe(url+'?page=2'); expect(result.advertisedTotal).toBe(1897);
    expect(parseFullh4rdPage(card,url).nextUrl).toBeNull();
  });
  it('deduplica por publicación y rechaza hosts ajenos y enlaces sin producto', () => {
    expect(parseFullh4rdPage(card+card,url).products).toHaveLength(1);
    expect(parseFullh4rdPage(card.replace('/prod/28129/','https://evil.test/prod/28129/'),url).products).toHaveLength(0);
    expect(parseFullh4rdPage(card.replace('/prod/28129/','/tag/'),url).products).toHaveLength(0);
  });
  it('distingue bloqueo de un catálogo vacío', () => {
    expect(parseFullh4rdPage('<title>Un momento…</title>',url)).toMatchObject({blocked:true,products:[]});
    expect(parseFullh4rdPage('',url).blocked).toBe(false);
  });
  it('mantiene las tarjetas anteriores y no etiqueta una PC como GPU', () => {
    const html='<div class="item in-stock"><h3><a href="/prod/32133/pc-gamer">PC GAMER AMD RYZEN 5 4500 A520 16GB SSD 500GB RTX 3050 GABINETE KIT</a></h3><div class="price">$1.065.819,00</div></div>';
    expect(parseFullh4rdPage(html,url,'tarjetas-graficas').products[0]).toMatchObject({category:'computadoras',lowestPrice:1065819});
  });
});
