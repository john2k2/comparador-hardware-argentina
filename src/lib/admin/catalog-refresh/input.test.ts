import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseRefreshInput, parseInputFromSearchParams } from '@/lib/admin/catalog-refresh/input';

describe('catalog-refresh input', () => {
  it('parses GET params with clamped limits and normalized stores', () => {
    const request = new NextRequest('http://localhost/api/admin/catalog-refresh?mode=custom&q=ryzen%207800x3d&category=procesadores&stores=Mexx,VENEX&maxQueries=999&staleMinutes=2');
    const parsed = parseInputFromSearchParams(request);

    expect(parsed).toEqual({
      mode: 'custom',
      query: 'ryzen 7800x3d',
      categories: ['procesadores'],
      stores: ['mexx', 'venex'],
      maxQueries: 200,
      staleMinutes: 5,
    });
  });

  it('merges POST body over search params without duplicating categories', async () => {
    const request = new NextRequest('http://localhost/api/admin/catalog-refresh?category=procesadores&maxQueries=20', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'tracked',
        categories: ['procesadores', 'tarjetas-graficas'],
        stores: ['Venex'],
        maxQueries: 50,
      }),
      headers: { 'content-type': 'application/json' },
    });

    await expect(parseRefreshInput(request)).resolves.toEqual({
      mode: 'tracked',
      query: undefined,
      categories: ['procesadores', 'tarjetas-graficas'],
      stores: ['venex'],
      maxQueries: 50,
      staleMinutes: 180,
    });
  });
});
