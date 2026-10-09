import { type Page } from '@playwright/test';
import { expect, test } from './fixtures/deterministic.fixture';

const now = new Date('2026-10-09T21:00:00.000Z');

function product(id: string, name: string, price: number, category: string) {
  return {
    id, name, model: name, brand: 'Fixture', category, specs: {},
    prices: [{ storeId: 'mexx', storeName: 'Mexx',
      url: `https://www.mexx.com.ar/product/${name.toLowerCase().replaceAll(' ', '-')}`,
      price, stock: 'in-stock', installment: null, lastUpdated: now.toISOString() }],
    lowestPrice: price, highestPrice: price, averagePrice: price,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}

async function selectProducts(page: Page, left: ReturnType<typeof product>, right: ReturnType<typeof product>) {
  await page.clock.setFixedTime(now);
  await page.route('**/api/products?**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    await route.fulfill({ json: { products: query === left.name ? [left] : [right] } });
  });
  await page.goto('/comparativa/comparar');
  await page.getByLabel('TIPO DE COMPONENTE', { exact: true }).selectOption(left.category);
  for (const [side, selected] of [['A', left], ['B', right]] as const) {
    const input = page.getByRole('textbox', { name: `Buscar producto ${side}`, exact: true });
    await input.fill(selected.name);
    await input.press('Enter');
    await page.getByRole('button').filter({ hasText: selected.name }).click();
  }
}

test('la RTX 3050 de 6 GB conserva su precio sin heredar el rendimiento de la variante de 8 GB', async ({ page }) => {
  await selectProducts(page,
    product('gpu-3050-6gb', 'RTX 3050 6GB', 100_000, 'tarjetas-graficas'),
    product('gpu-4060-8gb', 'RTX 4060 8GB', 300_000, 'tarjetas-graficas'));
  const decision = page.locator('section').filter({ has: page.getByRole('heading', { name: '[ ¿CUÁL CONVIENE? ]', exact: true }) });
  const prices = page.getByRole('row').filter({ hasText: 'Mejor precio reciente (24 h)' });
  await expect(prices).toContainText('100.000');
  await expect(prices).toContainText('300.000');
  await expect(decision).not.toContainText('conviene más');
  await expect(page.getByText('Todavía no tenemos un benchmark verificable', { exact: false })).toBeVisible();
  await expect(page.getByText(/puntos de .* por cada \$100.000/)).toHaveCount(0);
  await expect(page.getByText('PRODUCTO A · RTX 3050 8GB', { exact: true })).toHaveCount(0);
});

test('el comparador usa la siguiente oferta válida de la tienda cuando la barata contradice el cooler', async ({ page }) => {
  const left = product('cpu-5500-wraith', 'AMD Ryzen 5 5500 con Wraith Stealth', 300_000, 'procesadores');
  left.prices.unshift({ ...left.prices[0], price: 100_000, url: 'https://www.mexx.com.ar/product/ryzen-5-5500-sin-cooler' });
  const right = product('cpu-5600-wraith', 'AMD Ryzen 5 5600 con Wraith Stealth', 200_000, 'procesadores');
  await selectProducts(page, left, right);
  const decision = page.locator('section').filter({ has: page.getByRole('heading', { name: '[ ¿CUÁL CONVIENE? ]', exact: true }) });
  const prices = page.getByRole('row').filter({ hasText: 'Mejor precio reciente (24 h)' });
  await expect(prices).toContainText('300.000');
  await expect(prices).toContainText('200.000');
  await expect(prices).not.toContainText('100.000');
  await expect(decision).toContainText(`${right.name} es la opción de menor precio`);
});
