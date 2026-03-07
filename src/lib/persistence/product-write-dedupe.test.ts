import { describe, expect, it } from 'vitest';
import {
  buildPriceStateSignature,
  buildProductContentSignature,
  planPriceRowPersistence,
  planProductRowPersistence,
} from './product-write-dedupe';

describe('product write dedupe', () => {
  it('keeps product signatures stable when specs order changes', () => {
    const first = buildProductContentSignature({
      name: 'Ryzen 5 5600',
      category: 'procesadores',
      brand: 'AMD',
      model: 'Ryzen 5 5600',
      description: 'CPU AM4',
      image: '/cpu.png',
      normalized_title: 'amd ryzen 5 5600',
      canonical_product_key: 'procesadores::cpu:ryzen5-5600',
      family_key: 'procesadores::cpu:ryzen5',
      variant_key: 'procesadores::cpu:5600',
      refresh_priority: 'hot',
      specs: {
        socket: 'AM4',
        cores: '6',
      },
      lowest_price: 180000,
      highest_price: 210000,
      average_price: 195000,
    });

    const second = buildProductContentSignature({
      name: 'Ryzen 5 5600',
      category: 'procesadores',
      brand: 'AMD',
      model: 'Ryzen 5 5600',
      description: 'CPU AM4',
      image: '/cpu.png',
      normalized_title: 'amd ryzen 5 5600',
      canonical_product_key: 'procesadores::cpu:ryzen5-5600',
      family_key: 'procesadores::cpu:ryzen5',
      variant_key: 'procesadores::cpu:5600',
      refresh_priority: 'hot',
      specs: {
        cores: '6',
        socket: 'AM4',
      },
      lowest_price: 180000,
      highest_price: 210000,
      average_price: 195000,
    });

    expect(first).toBe(second);
  });

  it('skips unchanged product rows until the freshness touch expires', () => {
    const now = new Date('2026-03-07T12:00:00.000Z');
    const signature = buildProductContentSignature({
      name: 'Ryzen 5 5600',
      category: 'procesadores',
      brand: 'AMD',
      model: 'Ryzen 5 5600',
      description: 'CPU AM4',
      image: '/cpu.png',
      normalized_title: 'amd ryzen 5 5600',
      canonical_product_key: 'procesadores::cpu:ryzen5-5600',
      family_key: 'procesadores::cpu:ryzen5',
      variant_key: 'procesadores::cpu:5600',
      refresh_priority: 'hot',
      specs: { socket: 'AM4' },
      lowest_price: 180000,
      highest_price: 210000,
      average_price: 195000,
    });

    const fresh = planProductRowPersistence({
      name: 'Ryzen 5 5600',
      category: 'procesadores',
      brand: 'AMD',
      model: 'Ryzen 5 5600',
      description: 'CPU AM4',
      image: '/cpu.png',
      normalized_title: 'amd ryzen 5 5600',
      canonical_product_key: 'procesadores::cpu:ryzen5-5600',
      family_key: 'procesadores::cpu:ryzen5',
      variant_key: 'procesadores::cpu:5600',
      refresh_priority: 'hot',
      specs: { socket: 'AM4' },
      lowest_price: 180000,
      highest_price: 210000,
      average_price: 195000,
    }, {
      content_signature: signature,
      last_seen_at: '2026-03-07T07:00:00.000Z',
      last_scraped_at: '2026-03-07T07:00:00.000Z',
    }, now);

    const stale = planProductRowPersistence({
      name: 'Ryzen 5 5600',
      category: 'procesadores',
      brand: 'AMD',
      model: 'Ryzen 5 5600',
      description: 'CPU AM4',
      image: '/cpu.png',
      normalized_title: 'amd ryzen 5 5600',
      canonical_product_key: 'procesadores::cpu:ryzen5-5600',
      family_key: 'procesadores::cpu:ryzen5',
      variant_key: 'procesadores::cpu:5600',
      refresh_priority: 'hot',
      specs: { socket: 'AM4' },
      lowest_price: 180000,
      highest_price: 210000,
      average_price: 195000,
    }, {
      content_signature: signature,
      last_seen_at: '2026-03-06T20:00:00.000Z',
      last_scraped_at: '2026-03-06T20:00:00.000Z',
    }, now);

    expect(fresh.shouldUpsert).toBe(false);
    expect(fresh.changed).toBe(false);
    expect(stale.shouldUpsert).toBe(true);
    expect(stale.changed).toBe(false);
  });

  it('only writes price history when the price state changed', () => {
    const now = new Date('2026-03-07T12:00:00.000Z');
    const signature = buildPriceStateSignature({
      price: 99999,
      original_price: 109999,
      stock: 'in-stock',
      installment_count: 6,
      installment_amount: 16666,
    });

    const unchanged = planPriceRowPersistence({
      price: 99999,
      original_price: 109999,
      stock: 'in-stock',
      installment_count: 6,
      installment_amount: 16666,
    }, {
      state_signature: signature,
      last_updated: '2026-03-07T08:30:00.000Z',
    }, now);

    const changed = planPriceRowPersistence({
      price: 94999,
      original_price: 109999,
      stock: 'in-stock',
      installment_count: 6,
      installment_amount: 15833,
    }, {
      state_signature: signature,
      last_updated: '2026-03-07T08:30:00.000Z',
    }, now);

    expect(unchanged.shouldUpsert).toBe(false);
    expect(unchanged.changed).toBe(false);
    expect(changed.shouldUpsert).toBe(true);
    expect(changed.changed).toBe(true);
  });

  it('touches unchanged price rows only after the heartbeat window', () => {
    const now = new Date('2026-03-07T12:00:00.000Z');
    const signature = buildPriceStateSignature({
      price: 99999,
      original_price: null,
      stock: 'in-stock',
      installment_count: null,
      installment_amount: null,
    });

    const stale = planPriceRowPersistence({
      price: 99999,
      original_price: null,
      stock: 'in-stock',
      installment_count: null,
      installment_amount: null,
    }, {
      state_signature: signature,
      last_updated: '2026-03-06T22:00:00.000Z',
    }, now);

    expect(stale.shouldUpsert).toBe(true);
    expect(stale.changed).toBe(false);
  });
});
