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
});
