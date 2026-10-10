import { type Page } from '@playwright/test';
import { expect, test } from './fixtures/deterministic.fixture';

const now = new Date('2026-10-09T21:00:00.000Z');
function product(id: string, name: string, price: number, category: string) {
  return {
    id, name, model: name, brand: 'Fixture', category, specs: { socket: category === 'procesadores' ? 'AM5/AM4 según modelo' : 'No aplica' },
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
  await page.getByLabel('¿PARA QUÉ LO VAS A USAR?', { exact: true }).selectOption(categoryUse(left.category));
  for (const [side, selected] of [['A', left], ['B', right]] as const) {
    const input = page.getByRole('textbox', { name: `Buscar producto ${side}`, exact: true });
    await input.fill(selected.name);
    await input.press('Enter');
    await page.getByRole('button').filter({ hasText: selected.name }).click();
  }
}
const categoryUse = (category: string) => category === 'procesadores' ? 'productividad' : 'gaming';
const valueSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: '[ RENDIMIENTO Y VALOR ]', exact: true }) });
const decisionSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: '[ ¿CUÁL CONVIENE? ]', exact: true }) });

for (const width of [1440, 390]) test.describe(`procedencia y abstención ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test('7600 y 7600X muestran sus dos valores constatados sin enlazar un modelo como fuente de otro', async ({ page }) => {
    await selectProducts(page,
      product('cpu-7600', 'AMD Ryzen 5 7600', 400_000, 'procesadores'),
      product('cpu-7600x', 'AMD Ryzen 5 7600X', 500_000, 'procesadores'));
    const value = valueSection(page);
    await expect(value).toContainText('12.979');
    await expect(value).toContainText('2.484');
    await expect(value).toContainText('13.583');
    await expect(value).toContainText('2.592');
    await expect(value).toContainText('Geekbench 7');
    await expect(value).toContainText('consulta 2026-10-10T01:19:01.876Z');
    await expect(value.getByRole('link', { name: 'Geekbench 7 Processor Benchmark Chart · Ryzen 5 7600', exact: true }))
      .toHaveAttribute('href', 'https://browser.geekbench.com/processor-benchmarks');
    await expect(value.getByRole('link', { name: 'Geekbench 7 Processor Benchmark Chart · Ryzen 5 7600X', exact: true }))
      .toHaveAttribute('href', 'https://browser.geekbench.com/processor-benchmarks');
    await expect(value.getByText(/puntos de .* por cada \$100.000/)).toHaveCount(2);
    await expect(decisionSection(page)).toContainText('puntaje Geekbench 7 multinúcleo por peso');
    await expect(value).not.toContainText('13.135');
  });
  test('GPU sin derivación verificable conserva precios sin fabricar rendimiento por peso', async ({ page }) => {
    await selectProducts(page,
      product('gpu-4060', 'RTX 4060 8GB', 400_000, 'tarjetas-graficas'),
      product('gpu-7600', 'RX 7600 8GB', 300_000, 'tarjetas-graficas'));
    await expect(page.getByRole('row').filter({ hasText: 'Mejor precio reciente (24 h)' })).toContainText('400.000');
    await expect(page.getByRole('row').filter({ hasText: 'Mejor precio reciente (24 h)' })).toContainText('300.000');
    await expect(valueSection(page)).toContainText('Todavía no tenemos un benchmark verificable');
    await expect(valueSection(page).getByRole('link')).toHaveCount(0);
    await expect(page.getByText(/puntos de .* por cada \$100.000/)).toHaveCount(0);
    await expect(decisionSection(page)).toContainText('RX 7600 8GB es la opción de menor precio');
    await expect(decisionSection(page)).not.toContainText('conviene más');
  });
  test('una CPU no cubierta conserva especificaciones y precio con abstención explícita', async ({ page }) => {
    const left = product('cpu-7500f', 'AMD Ryzen 5 7500F', 200_000, 'procesadores');
    left.specs.socket = 'AM5';
    const right = product('cpu-7600', 'AMD Ryzen 5 7600', 400_000, 'procesadores');
    right.specs.socket = 'AM5';
    await selectProducts(page, left, right);
    await expect(valueSection(page)).toContainText('Todavía no tenemos un benchmark verificable');
    await expect(page.getByRole('row').filter({ hasText: 'Socket' })).toContainText('AM5');
    await expect(decisionSection(page)).toContainText('AMD Ryzen 5 7500F es la opción de menor precio');
    await expect(page.getByText(/puntos de .* por cada \$100.000/)).toHaveCount(0);
  });
});
