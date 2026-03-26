import { describe, expect, it } from 'vitest';
import {
  buildSinglePriceProduct,
  cleanScrapedText,
  extractFirstSrcSetUrl,
  extractKnownHardwareBrand,
  normalizeScrapedAbsoluteUrl,
  parseScrapedArsPrice,
  slugFromScrapedUrl,
} from './scraper-helpers';

describe('scraper-helpers', () => {
  it('parsea montos ARS locales en scrapers sin inflar decimales', () => {
    expect(parseScrapedArsPrice('$ 248.496,11')).toBe(248_496);
    expect(parseScrapedArsPrice('248.496')).toBe(248_496);
    expect(parseScrapedArsPrice(248_496)).toBe(248_496);
  });

  it('normaliza texto y URLs de scraping', () => {
    expect(cleanScrapedText('  RTX   5070   Ti  ')).toBe('RTX 5070 Ti');
    expect(normalizeScrapedAbsoluteUrl('https://tienda.com.ar', '/productos/rtx')).toBe('https://tienda.com.ar/productos/rtx');
    expect(normalizeScrapedAbsoluteUrl('https://tienda.com.ar', '//cdn.tienda.com.ar/img.png')).toBe('https://cdn.tienda.com.ar/img.png');
  });

  it('extrae imagen primaria y slug desde datos del scraper', () => {
    expect(extractFirstSrcSetUrl('https://cdn.a/img-1.webp 320w, https://cdn.a/img-2.webp 640w')).toBe('https://cdn.a/img-1.webp');
    expect(slugFromScrapedUrl('https://tienda.com.ar/productos/rtx-5070-ti/?ref=home')).toBe('rtx-5070-ti');
  });

  it('detecta marcas conocidas y construye productos single-store consistentes', () => {
    expect(extractKnownHardwareBrand('Placa de video ASUS RTX 5070 Ti')).toBe('ASUS');

    const product = buildSinglePriceProduct({
      id: 'store-rtx-5070-ti',
      name: '  Placa de video ASUS RTX 5070 Ti  ',
      category: 'tarjetas-graficas',
      storeId: 'store',
      storeName: 'Store',
      storeBaseUrl: 'https://tienda.com.ar',
      url: '/productos/rtx-5070-ti/',
      image: '//cdn.tienda.com.ar/rtx.webp',
      description: '  GPU de prueba  ',
      price: '$ 1.249.999,00',
      stock: 'in-stock',
    });

    expect(product).not.toBeNull();
    expect(product?.brand).toBe('ASUS');
    expect(product?.prices[0].price).toBe(1_249_999);
    expect(product?.prices[0].url).toBe('https://tienda.com.ar/productos/rtx-5070-ti/');
    expect(product?.image).toBe('https://cdn.tienda.com.ar/rtx.webp');
    expect(product?.description).toBe('GPU de prueba');
  });
});
