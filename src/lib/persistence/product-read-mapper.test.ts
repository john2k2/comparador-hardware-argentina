import { describe, expect, it } from 'vitest';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';

describe('product-read-mapper', () => {
  it('maps DB rows into sanitized domain products with comparable prices', () => {
    const row: DbProductRow = {
      id: 'db-product-1',
      name: 'AMD Ryzen 5 7600',
      category: 'procesadores',
      brand: 'AMD',
      model: 'Ryzen 5 7600',
      description: null,
      image: null,
      normalized_title: 'amd ryzen 5 7600',
      canonical_product_key: 'procesadores|amd-ryzen-5-7600',
      family_key: 'ryzen-5-7600',
      variant_key: 'tray',
      refresh_priority: 'hot',
      last_scraped_at: '2026-03-26T11:00:00.000Z',
      last_normalized_at: '2026-03-26T11:05:00.000Z',
      specs: { socket: 'AM5' },
      lowest_price: '450000',
      highest_price: '470000',
      average_price: '460000',
      created_at: '2026-03-20T10:00:00.000Z',
      updated_at: '2026-03-26T11:10:00.000Z',
      product_prices: [
        {
          store_id: 'mexx',
          url: 'https://store.example.com/7600',
          price: '450000',
          original_price: '470000',
          stock: 'in-stock',
          installment_count: 6,
          installment_amount: '90000',
          last_updated: '2026-03-26T11:10:00.000Z',
        },
      ],
    };

    const product = mapDbProduct(row);

    expect(product.id).toBe('db-product-1');
    expect(product.description).toBe('AMD Ryzen 5 7600');
    expect(product.image).toBe('/pixel-box.svg');
    expect(product.lowestPrice).toBe(450000);
    expect(product.prices[0]?.storeName).toBe('Mexx');
    expect(product.prices[0]?.installment).toEqual({
      count: 6,
      amount: 90000,
      totalAmount: 540000,
      interest: false,
    });
  });

  it('keeps the persisted category so count, pagination and mapped rows agree', () => {
    const row = {
      id: 'legacy-ryzen',
      name: 'AMD Ryzen 7 5700X AM4',
      category: 'tarjetas-graficas',
      brand: 'AMD',
      model: 'Ryzen 7 5700X',
      description: null,
      image: null,
      normalized_title: null,
      canonical_product_key: null,
      family_key: null,
      variant_key: null,
      refresh_priority: null,
      last_scraped_at: null,
      last_normalized_at: null,
      specs: null,
      lowest_price: 200000,
      highest_price: 200000,
      average_price: 200000,
      created_at: '2026-03-20T10:00:00.000Z',
      updated_at: '2026-03-26T11:10:00.000Z',
      product_prices: [],
    } satisfies DbProductRow;

    expect(mapDbProduct(row).category).toBe('tarjetas-graficas');
  });

  it('corrige en lectura la identidad heredada de una GPU sin cambiar su URL', () => {
    const row = {
      id: 'agrupado-perifericos-gigabyte-rx-7600',
      name: 'Placa de Video Gigabyte RX 7600 Gaming 8GB',
      category: 'tarjetas-graficas',
      brand: 'Gigabyte',
      model: 'RX 7600 Gaming',
      description: null,
      image: null,
      normalized_title: 'GIGABYTE RX 7600 GAMING 8GB',
      canonical_product_key: 'perifericos::generic:gigabyte:other:8gb',
      family_key: null,
      variant_key: null,
      refresh_priority: null,
      last_scraped_at: null,
      last_normalized_at: null,
      specs: null,
      lowest_price: 550000,
      highest_price: 550000,
      average_price: 550000,
      created_at: '2026-03-20T10:00:00.000Z',
      updated_at: '2026-03-26T11:10:00.000Z',
      product_prices: [],
    } satisfies DbProductRow;

    const mapped = mapDbProduct(row);
    expect(mapped.id).toBe(row.id);
    expect(mapped.canonicalProductKey).toMatch(/^tarjetas-graficas::gpu:rx7600/);
  });

  it('no reutiliza claves de RAM heredadas que mezclan Corsair LPX con RS', () => {
    const base = {
      id: 'corsair-lpx', name: 'Memoria Ram Corsair Vengeance LPX Black 16GB 3200 Mhz DDR4',
      category: 'memoria-ram', brand: 'Corsair', model: null, description: null, image: null,
      normalized_title: null, canonical_product_key: 'memoria-ram::ram:corsair:vengeance:16gb:ddr4:na:unk',
      family_key: null, variant_key: null, refresh_priority: null, last_scraped_at: null,
      last_normalized_at: null, specs: null, lowest_price: 100, highest_price: 100,
      average_price: 100, created_at: '2026-03-20T10:00:00.000Z', updated_at: '2026-03-26T11:10:00.000Z',
      product_prices: [],
    } satisfies DbProductRow;
    const rs = { ...base, id: 'corsair-rs', name: 'Memoria Ram Corsair Vengeance RS RGB 16GB 3200 Mhz DDR4' } satisfies DbProductRow;

    expect(mapDbProduct(base).canonicalProductKey).not.toBe(mapDbProduct(rs).canonicalProductKey);
    expect(mapDbProduct(base).id).toBe('corsair-lpx');
  });

  it('retiene para revisión una URL LPX asociada por error a una ficha RS', () => {
    const row = {
      id: 'corsair-rs', name: 'Memoria Ram Corsair Vengeance RS RGB 16GB 3200 Mhz DDR4',
      category: 'memoria-ram', brand: 'Corsair', model: null, description: null, image: null,
      normalized_title: null, canonical_product_key: null, family_key: null, variant_key: null,
      refresh_priority: null, last_scraped_at: null, last_normalized_at: null, specs: null,
      lowest_price: 100, highest_price: 100, average_price: 100,
      created_at: '2026-03-20T10:00:00.000Z', updated_at: '2026-03-26T11:10:00.000Z',
      product_prices: [{
        store_id: 'mexx', url: 'https://store.example/corsair-vengeance-lpx-16gb-ddr4-3200',
        price: 100, original_price: null, stock: 'in-stock', installment_count: null,
        installment_amount: null, last_updated: '2026-03-26T11:10:00.000Z',
      }],
    } satisfies DbProductRow;

    const mapped = mapDbProduct(row);
    expect(mapped.prices[0]?.identityReview).toMatchObject({ status: 'needs-review', reason: 'explicit-conflict' });
  });
});

it('una aprobación vieja no oculta una contradicción del título observado de GPU', () => {
  const name = 'ASUS Dual RTX 5060 8GB EVO OC';
  const url = 'https://store.example/123';
  const row: DbProductRow = {
    id: 'asus-evo', name, category: 'tarjetas-graficas', brand: 'ASUS', model: name,
    description: null, image: null, normalized_title: null,
    canonical_product_key: 'tarjetas-graficas::gpu:rtx5060:8gb:asus:dual',
    family_key: null, variant_key: null, refresh_priority: null, last_scraped_at: null,
    last_normalized_at: null, specs: null, lowest_price: 100, highest_price: 100, average_price: 100,
    created_at: '2026-09-29T12:00:00Z', updated_at: '2026-09-29T12:00:00Z',
    product_prices: [{ store_id: 'mexx', url, price: 100, original_price: null, stock: 'in-stock',
      installment_count: null, installment_amount: null, last_updated: '2026-09-29T12:00:00Z',
      identity_review: { version: 1, status: 'consistent', reason: 'consistent-text', reviewedAt: '2026-09-29T12:00:00Z',
        model: 'jev-1.13.0', confidence: 0.95, subject: { name: name.toLowerCase(), category: 'tarjetas-graficas', url },
        sourceIdentity: { listingRef: 'mexx:123', title: 'ASUS Dual RTX 5060 8GB ADVANCED OC' } } }],
  };
  const mapped = mapDbProduct(row);
  expect(mapped.id).toBe('asus-evo');
  expect(mapped.canonicalProductKey).toContain(':evo:');
  expect(mapped.prices[0]?.identityReview).toMatchObject({ status: 'needs-review', reason: 'explicit-conflict',
    sourceIdentity: { listingRef: 'mexx:123' } });
});
