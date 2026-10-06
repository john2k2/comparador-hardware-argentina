import { describe, expect, it } from 'vitest';
import { buildOfferReportBody, buildOfferReportHref, parseOfferReport } from './offer-report';

describe('contexto del reporte de ofertas', () => {
  it('conserva producto/tienda y prepara una ruta local sin envío automático', () => {
    const input = { productId: 'cpu/7#test', productName: 'Ryzen 7 & cooler', storeId: 'mexx', storeName: 'Mexx', offerUrl: 'https://www.mexx.com.ar/producto/7?id=7&utm_source=test' };
    const href = buildOfferReportHref(input);
    expect(href.startsWith('/contacto?')).toBe(true);
    const url = new URL(href, 'https://catalog.example');
    const parsed = parseOfferReport(Object.fromEntries(url.searchParams));
    expect(parsed).toEqual({ ...input, offerUrl: 'https://www.mexx.com.ar/producto/7?id=7' });
    const body = buildOfferReportBody(parsed!, 'https://catalog.example');
    expect(body).toContain('https://catalog.example/product/cpu%2F7%23test');
    expect(body).toContain('Problema observado:');
    expect(href).not.toContain('mailto:');
  });

  it('ignora protocolos activos, credenciales, arrays y campos ajenos', () => {
    for (const offerUrl of ['javascript:alert(1)', 'data:text/html,Hi', 'https://user:secret@shop.example/p', '/relative']) {
      expect(parseOfferReport({ report: 'offer', productName: 'CPU', offerUrl })?.offerUrl).toBeUndefined();
    }
    expect(parseOfferReport({ report: 'offer', productName: ['CPU', 'GPU'] })).toBeNull();
    expect(parseOfferReport({ productName: 'CPU' })).toBeNull();
    expect(buildOfferReportHref({ productName: '' })).toBe('/contacto#reportar-oferta');
  });

  it('limita texto y descarta sesión/tokens sin perder identificadores de producto', () => {
    const report = parseOfferReport({ report: 'offer', productName: 'CPU\r\nBcc: x'.repeat(100),
      offerUrl: 'https://shop.example/p?id=7&token=secret&session=abc&product_id=88#private' })!;
    expect(report.productName).toHaveLength(180);
    expect(report.productName).not.toMatch(/[\r\n]/);
    expect(report.offerUrl).toBe('https://shop.example/p?id=7&product_id=88');
    expect(parseOfferReport({ report: 'offer', productName: 'CPU', offerUrl: `https://shop.example/${'a'.repeat(1500)}` })?.offerUrl).toBeUndefined();
    expect(parseOfferReport({ report: 'offer', productName: 'CPU', productId: 'a'.repeat(257) })?.productId).toBeUndefined();
  });
});
