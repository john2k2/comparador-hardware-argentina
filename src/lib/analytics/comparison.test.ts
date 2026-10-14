import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { OFFER_FRESH_MS } from '@/lib/price-freshness';
import { trackComparisonProductOpen, trackComparisonResult } from './comparison';

const now = Date.parse('2026-10-12T20:00:00Z');
function product(id: string, name: string): Product {
  const date = new Date(now);
  return { id, name, model: name, category: 'procesadores', brand: 'AMD', specs: {},
    lowestPrice: 100_000, highestPrice: 100_000, averagePrice: 100_000, createdAt: date, updatedAt: date,
    prices: [{ storeId: 'mexx', storeName: 'Mexx', url: `https://www.mexx.com.ar/product/${name.toLowerCase().replaceAll(' ', '-')}`,
      price: 100_000, stock: 'in-stock', installment: null, lastUpdated: date }] };
}
const left = () => product('agrupado-5600', 'AMD Ryzen 5 5600');
const right = () => product('agrupado-5700', 'AMD Ryzen 7 5700');

describe('medición consentida de comparación', () => {
  const gtag = vi.fn();
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'G-TEST123');
    vi.stubGlobal('window', { gtag, __chaAnalyticsAllowed: true, __chaAnalyticsMeasurementId: 'G-RUNTIME123',
      location: { href: 'https://test.local/comparativa/comparar' } });
    gtag.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('espera consentimiento y registra una sola comparación resuelta tras aceptar tarde', () => {
    const context = { left: left(), right: right(), useCase: 'gaming' as const };
    window.__chaAnalyticsAllowed = false;
    trackComparisonResult(context, now);
    expect(gtag).not.toHaveBeenCalled();
    window.__chaAnalyticsAllowed = true;
    trackComparisonResult(context, now);
    trackComparisonResult(context, now + 1000);
    trackComparisonResult({ ...context, left: { ...context.left } }, now);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'comparison_result', {
      product_category: 'procesadores', comparison_use_case: 'gaming',
      left_product_id: 'agrupado-5600', right_product_id: 'agrupado-5700',
      left_eligible_offers_3h: 1, right_eligible_offers_3h: 1, comparison_price_gate_3h: true,
      send_to: 'G-RUNTIME123',
    });
  });

  it('no consume la deduplicación si GA4 todavía no está disponible', () => {
    const context = { left: left(), right: right(), useCase: 'gaming' as const };
    window.__chaAnalyticsMeasurementId = 'invalid';
    trackComparisonResult(context, now);
    window.__chaAnalyticsMeasurementId = 'G-RUNTIME123';
    trackComparisonResult(context, now);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it('rechaza una selección ausente, parcial, con categorías distintas o IDs que no son de catálogo', () => {
    for (const context of [
      { left: null, right: null, useCase: 'gaming' as const },
      { left: left(), right: null, useCase: 'gaming' as const },
      { left: left(), right: { ...right(), category: 'memoria-ram' as const }, useCase: 'gaming' as const },
      { left: { ...left(), id: 'https://shop.example/private' }, right: right(), useCase: 'gaming' as const },
    ]) {
      trackComparisonResult(context, now);
      trackComparisonProductOpen(context, 'a');
    }
    expect(gtag).not.toHaveBeenCalled();
  });

  it('no cuenta comparar el mismo ID consigo mismo ni abrir A/B de esa selección', () => {
    const context = { left: left(), right: { ...right(), id: left().id }, useCase: 'gaming' as const };
    trackComparisonResult(context, now);
    trackComparisonProductOpen(context, 'a');
    trackComparisonProductOpen(context, 'b');
    expect(gtag).not.toHaveBeenCalled();
  });

  it('acepta los puntos y dos puntos permitidos por la recuperación de selección', () => {
    const context = { left: { ...left(), id: 'catalog.source:5600' }, right: { ...right(), id: 'catalog.source:5700' }, useCase: 'gaming' as const };
    trackComparisonResult(context, now);
    trackComparisonProductOpen(context, 'b');
    expect(gtag).toHaveBeenCalledWith('event', 'comparison_result', expect.objectContaining({ left_product_id: 'catalog.source:5600', right_product_id: 'catalog.source:5700' }));
    expect(gtag).toHaveBeenCalledWith('event', 'comparison_product_open', expect.objectContaining({ product_id: 'catalog.source:5700', comparison_side: 'b' }));
  });

  it('mide IDs válidos de 200 caracteres sin enviarlos ni confundir dos IDs con el mismo prefijo', () => {
    const prefix = 'a'.repeat(199);
    const first = { left: { ...left(), id: `${prefix}x` }, right: right(), useCase: 'gaming' as const };
    const second = { ...first, left: { ...first.left, id: `${prefix}y` } };
    trackComparisonResult(first, now);
    trackComparisonResult(first, now);
    trackComparisonResult(second, now);
    trackComparisonProductOpen(first, 'a');
    trackComparisonProductOpen(first, 'a');
    trackComparisonProductOpen(second, 'a');
    expect(gtag.mock.calls.filter(call => call[1] === 'comparison_result')).toHaveLength(2);
    expect(gtag.mock.calls.filter(call => call[1] === 'comparison_product_open')).toHaveLength(2);
    for (const call of gtag.mock.calls) {
      const payload = call[2] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('left_product_id');
      expect(payload).not.toHaveProperty('product_id');
      expect(payload).toMatchObject({ right_product_id: 'agrupado-5700', product_category: 'procesadores', comparison_use_case: 'gaming' });
      expect(Object.values(payload).filter(value => typeof value === 'string').every(value => (value as string).length <= 100)).toBe(true);
    }
    trackComparisonResult({ ...first, left: { ...first.left, id: 'a'.repeat(201) } }, now);
    expect(gtag).toHaveBeenCalledTimes(4);
  });

  it('cuenta tiendas elegibles con identidad, stock y observación real de hasta tres horas', () => {
    const a = left(), b = right(), base = a.prices[0];
    a.prices.push({ ...base, price: 110_000 },
      { ...base, storeId: 'venex', url: 'https://www.venex.com.ar/amd-ryzen-5-5600.html', stock: 'unknown' },
      { ...base, storeId: 'maximus', url: 'https://www.maximus.com.ar/amd-ryzen-5-5600', stock: 'out-of-stock' },
      { ...base, lastUpdated: new Date(now - OFFER_FRESH_MS - 1) },
      { ...base, lastUpdated: new Date(now + 120_000) },
      { ...base, price: 0 },
      { ...base, identityReview: { status: 'pending', confidence: 0.2, reasons: ['modelo pendiente'] } },
      { ...base, sourceIdentity: { title: 'AMD Ryzen 5 7600' } });
    b.prices[0].lastUpdated = new Date(now - OFFER_FRESH_MS - 1);
    trackComparisonResult({ left: a, right: b, useCase: 'gaming' }, now);
    expect(gtag).toHaveBeenCalledWith('event', 'comparison_result', expect.objectContaining({
      left_eligible_offers_3h: 1, right_eligible_offers_3h: 0, comparison_price_gate_3h: false,
    }));
  });

  it('conserva el gate de la recomendación si el precio más barato de 24h ya venció aunque haya otra oferta fresca', () => {
    const a = left();
    a.prices[0].lastUpdated = new Date(now - OFFER_FRESH_MS - 1);
    a.prices.push({ ...a.prices[0], storeId: 'venex', url: 'https://www.venex.com.ar/amd-ryzen-5-5600.html', price: 120_000, lastUpdated: new Date(now) });
    trackComparisonResult({ left: a, right: right(), useCase: 'gaming' }, now);
    expect(gtag).toHaveBeenCalledWith('event', 'comparison_result', expect.objectContaining({
      left_eligible_offers_3h: 1, right_eligible_offers_3h: 1, comparison_price_gate_3h: false,
    }));
  });

  it.each([
    { reason: 'stock desconocido', change: (value: Product) => { value.prices[0].stock = 'unknown'; } },
    { reason: 'sin stock', change: (value: Product) => { value.prices[0].stock = 'out-of-stock'; } },
    { reason: 'precio cero', change: (value: Product) => { value.prices[0].price = 0; } },
    { reason: 'identidad pendiente', change: (value: Product) => { value.prices[0].identityReview = { status: 'pending', confidence: 0.2, reasons: ['pendiente'] }; } },
    { reason: 'modelo contradictorio', change: (value: Product) => { value.prices[0].sourceIdentity = { title: 'AMD Ryzen 5 7600' }; } },
    { reason: 'fecha vencida', change: (value: Product) => { value.prices[0].lastUpdated = new Date(now - OFFER_FRESH_MS - 1); } },
    { reason: 'fecha futura', change: (value: Product) => { value.prices[0].lastUpdated = new Date(now + 120_000); } },
  ])('una única oferta con $reason no se registra como elegible', ({ change }) => {
    const a = left();
    change(a);
    trackComparisonResult({ left: a, right: right(), useCase: 'gaming' }, now);
    expect(gtag).toHaveBeenCalledWith('event', 'comparison_result', expect.objectContaining({
      left_eligible_offers_3h: 0, right_eligible_offers_3h: 1, comparison_price_gate_3h: false,
    }));
  });

  it('una comparación sin ofertas resuelve información y no se presenta como compra ni oferta disponible', () => {
    trackComparisonResult({ left: { ...left(), prices: [] }, right: { ...right(), prices: [] }, useCase: 'gaming' }, now);
    const payload = gtag.mock.calls[0][2];
    expect(payload).toMatchObject({ left_eligible_offers_3h: 0, right_eligible_offers_3h: 0, comparison_price_gate_3h: false });
    expect(Object.keys(payload).sort()).toEqual(['comparison_price_gate_3h', 'comparison_use_case', 'left_eligible_offers_3h', 'left_product_id', 'product_category', 'right_eligible_offers_3h', 'right_product_id', 'send_to']);
  });

  it('permite otra pareja, uso o navegación, sin duplicar el mismo resultado', () => {
    const context = { left: left(), right: right(), useCase: 'gaming' as const };
    trackComparisonResult(context, now);
    trackComparisonResult({ ...context, useCase: 'productividad' }, now);
    trackComparisonResult({ ...context, right: product('agrupado-5500', 'AMD Ryzen 5 5500') }, now);
    window.location.href = 'https://test.local/comparativa/comparar?new=1';
    trackComparisonResult(context, now);
    expect(gtag).toHaveBeenCalledTimes(4);
  });

  it('registra sólo aperturas A/B explícitas y deduplica doble clic por pareja, uso y lado', () => {
    const context = { left: left(), right: right(), useCase: 'gaming' as const };
    trackComparisonResult(context, now);
    expect(gtag.mock.calls.filter(call => call[1] === 'comparison_product_open')).toHaveLength(0);
    trackComparisonProductOpen(context, 'a');
    trackComparisonProductOpen(context, 'a');
    trackComparisonProductOpen(context, 'b');
    const opens = gtag.mock.calls.filter(call => call[1] === 'comparison_product_open');
    expect(opens).toHaveLength(2);
    expect(opens[0][2]).toEqual({ product_category: 'procesadores', comparison_use_case: 'gaming',
      left_product_id: 'agrupado-5600', right_product_id: 'agrupado-5700', product_id: 'agrupado-5600', comparison_side: 'a', send_to: 'G-RUNTIME123' });
    expect(opens[1][2]).toMatchObject({ product_id: 'agrupado-5700', comparison_side: 'b' });
  });

  it('no recupera clics anteriores al consentimiento y bloquea eventos al retirarlo', () => {
    const context = { left: left(), right: right(), useCase: 'gaming' as const };
    window.__chaAnalyticsAllowed = false;
    trackComparisonProductOpen(context, 'a');
    window.__chaAnalyticsAllowed = true;
    trackComparisonResult(context, now);
    expect(gtag.mock.calls.map(call => call[1])).toEqual(['comparison_result']);
    window.__chaAnalyticsAllowed = false;
    trackComparisonProductOpen(context, 'b');
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it('sin navegador no arroja errores ni registra una comparación', () => {
    vi.stubGlobal('window', undefined);
    expect(() => trackComparisonResult({ left: left(), right: right(), useCase: 'gaming' }, now)).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();
  });
});
