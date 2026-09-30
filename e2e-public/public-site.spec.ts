import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cha-analytics-consent:v1', JSON.stringify({ allowed: false, savedAt: Date.now() }));
  });
});

test('el filtro de procesadores no entrega refrigeración como si fuera un CPU', async ({ request }) => {
  const response = await request.get('/api/search?q=ryzen&category=procesadores&maxPrice=200000&sortBy=price-asc');
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.products.length).toBeGreaterThan(0);
  const coolingProducts = data.products.filter((p: { name: string }) => /^(?:motherboard|mother|placa madre|gabinete|fuente|memoria|ram|water\s*cooler|cooler|refrigeraci[oó]n|ventilador|disipador)\b/i.test(p.name));
  expect(coolingProducts.map((p: { name: string })=>p.name)).toEqual([]);
});

test('busca con catálogo real, filtra precio y abre el producto correspondiente', async ({ page }, testInfo) => {
  await page.goto('/search?q=ryzen&category=procesadores&maxPrice=200000&sortBy=price-asc');
  const cards = page.locator('#product-grid-start article');
  await expect(cards.first()).toBeVisible();
  await expect(cards.locator('h3')).toHaveCount(await cards.count());
  for (const title of await cards.locator('h3').allTextContents()) {
    expect(title).not.toMatch(/^(?:mother|gabinete|fuente|memoria|ram|water\s*cooler|cooler|refrigeraci[oó]n|ventilador|disipador)\b/i);
  }
  await expect(page.getByLabel('Precio máximo')).toHaveValue('200000');
  await expect(page).toHaveURL(/maxPrice=200000/);
  await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toHaveCount(0);
  const apiPage = await page.request.get('/api/search?q=ryzen&category=procesadores&maxPrice=200000&sortBy=price-asc');
  expect(apiPage.status()).toBe(200);
  const apiData = await apiPage.json();
  const cardIds = await page.locator('#product-grid-start a[href^="/product/"]').evaluateAll(links => links.map(link => decodeURIComponent(new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1)!)));
  expect(cardIds).toEqual(apiData.products.map((product: { id: string }) => product.id));
  const link = page.locator('#product-grid-start a[href^="/product/"]').first();
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  const productId = decodeURIComponent(new URL(href!, 'https://www.comparador-hardware.com.ar').pathname.split('/').at(-1)!);
  const response = await page.request.get(`/api/products?id=${encodeURIComponent(productId)}`);
  expect(response.status()).toBe(200);
  await page.screenshot({ path: testInfo.outputPath('search-public.png'), fullPage: true });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/product/${productId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('a[href^="http"][target="_blank"]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('product-public.png'), fullPage: true });
});

test('armador recupera el ID elegido después de recargar', async ({ page }) => {
  await page.goto('/guia/armar');
  const cpu = page.getByLabel('Elegir Procesador', { exact: true });
  await expect(cpu.locator('option').nth(1)).toHaveAttribute('value', /.+/);
  const id = await cpu.locator('option').nth(1).getAttribute('value');
  expect(id).toBeTruthy();
  await cpu.selectOption(id!);
  await expect(cpu).toHaveValue(id!);
  await page.getByRole('button', { name: 'Guardar armado', exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText('Armado guardado');
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar guardado', exact: true }).click();
  await expect(cpu).toHaveValue(id!);
  await expect(page.locator('p[role="status"]')).toContainText('recuperado');
});

test('guía e índice presentan contenido real sin desbordar en móvil', async ({ page }, testInfo) => {
  for (const path of ['/guia/pc-gamer-1-millon', '/indice-precios-hardware']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (path.includes('/guia/')) {
      await expect(page.getByText('PRESUPUESTO DE REFERENCIA', { exact: true })).toBeVisible();
      await expect(page.getByText(/Margen de precios: hasta.*\(\+10%\)/)).toBeVisible();
      await expect(page.getByText(/Revisamos la selección una vez por semana o a pedido/)).toBeVisible();
    }
    if (path.includes('indice')) await expect(page.locator('a[href="/indice-precios-hardware/datos.csv"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${path.split('/').at(-1)}-public.png`), fullPage: true });
  }
});
