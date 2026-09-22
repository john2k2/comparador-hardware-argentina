import { expect, test, type Page } from '@playwright/test';
import type { Product, ProductPrice } from '../src/lib/types';

const slotLabels = [
  'Procesador',
  'Motherboard',
  'Memoria RAM',
  'Placa de video',
  'Almacenamiento',
  'Fuente',
  'Gabinete',
  'Refrigeración del procesador',
] as const;

const slotCategories: Record<string, Product['category']> = {
  cpu: 'procesadores',
  motherboard: 'motherboards',
  ram: 'memoria-ram',
  gpu: 'tarjetas-graficas',
  ssd: 'almacenamiento',
  psu: 'fuentes-alimentacion',
  case: 'gabinetes',
  cooler: 'refrigeracion',
};

const refreshTarget = {
  productId: 'cpu-5600',
  storeId: 'store-a',
  url: 'https://store.example/cpu-5600-a',
};

function offer(storeId: string, storeName: string, price: number, url: string): ProductPrice {
  return {
    storeId,
    storeName,
    url,
    price,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-09-21T10:00:00.000Z'),
  };
}

function fixtureProducts(): Product[] {
  const definitions: Array<Pick<Product, 'id' | 'name' | 'category' | 'specs'> & { prices: [number, number] }> = [
    { id: 'cpu-5600', name: 'AMD Ryzen 5 5600', category: 'procesadores', specs: { 'gráficos integrados': 'no', 'cooler incluido': 'no' }, prices: [100_000, 110_000] },
    { id: 'mb-b550', name: 'ASUS B550 AM4 DDR4', category: 'motherboards', specs: { socket: 'AM4', tipo: 'DDR4', formato: 'ATX', 'slots de memoria': '4' }, prices: [80_000, 90_000] },
    { id: 'mb-b550-alt', name: 'MSI B550 AM4 DDR4', category: 'motherboards', specs: { socket: 'AM4', tipo: 'DDR4', formato: 'ATX', 'slots de memoria': '4' }, prices: [85_000, 95_000] },
    { id: 'ram-16', name: 'Kingston Fury 16GB DDR4 3200', category: 'memoria-ram', specs: { módulos: '1' }, prices: [50_000, 60_000] },
    { id: 'gpu-4060', name: 'MSI GeForce RTX 4060 8GB', category: 'tarjetas-graficas', specs: { largo: '240 mm' }, prices: [300_000, 310_000] },
    { id: 'ssd-1tb', name: 'SSD NVMe 1TB Gen4', category: 'almacenamiento', specs: {}, prices: [40_000, 50_000] },
    { id: 'psu-650', name: 'Fuente 650W 80 Plus Gold', category: 'fuentes-alimentacion', specs: { potencia: '650W' }, prices: [70_000, 80_000] },
    { id: 'case-atx', name: 'Gabinete ATX Mesh', category: 'gabinetes', specs: { 'motherboards compatibles': 'ATX', 'largo máximo GPU': '300 mm' }, prices: [60_000, 70_000] },
    { id: 'cooler-am4', name: 'Cooler CPU AM4', category: 'refrigeracion', specs: { 'sockets compatibles': 'AM4', altura: '150 mm' }, prices: [20_000, 30_000] },
  ];
  return definitions.map((definition) => ({
    ...definition,
    brand: definition.name.split(' ')[0],
    model: definition.name,
    prices: [
      offer('store-a', 'Tienda A', definition.prices[0], `https://store.example/${definition.id}-a`),
      offer('store-b', 'Tienda B', definition.prices[1], `https://store.example/${definition.id}-b`),
    ],
    lowestPrice: definition.prices[0],
    highestPrice: definition.prices[1],
    averagePrice: Math.round((definition.prices[0] + definition.prices[1]) / 2),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-21T10:00:00.000Z'),
  }));
}

async function installCatalogRoute(page: Page) {
  const products = fixtureProducts();
  const state = { refreshed: false };
  let releaseCpu: () => void;
  const motherboardResponded = new Promise<void>((resolve) => { releaseCpu = resolve; });
  await page.route('**/api/pc-builder/catalog**', async (route) => {
    const url = new URL(route.request().url());
    const ids = url.searchParams.getAll('id');
    const catalog = products.map((product) => {
      if (!state.refreshed || product.id !== 'cpu-5600') return product;
      return {
        ...product,
        prices: product.prices.map((price) => price.storeId === 'store-a'
          ? { ...price, price: 120_000, lastUpdated: new Date('2026-09-21T12:05:00.000Z') }
          : price),
        lowestPrice: 110_000,
        averagePrice: 115_000,
      };
    });
    const result = ids.length
      ? catalog.filter((product) => ids.includes(product.id))
      : catalog.filter((product) => product.category === slotCategories[url.searchParams.get('slot') ?? '']);
    // La segunda solicitud termina primero: ninguna categoría debe perderse.
    if (!ids.length && url.searchParams.get('slot') === 'cpu') await motherboardResponded;
    if (!ids.length && url.searchParams.get('slot') === 'motherboard') result.reverse();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products: result }) });
    if (!ids.length && url.searchParams.get('slot') === 'motherboard') releaseCpu();
  });
  return { products, state };
}

async function loadBuilder(page: Page) {
  await page.goto('/guia/armar');
  await expect(page.getByRole('button', { name: 'Armar PC' })).toBeEnabled();
}

async function choose(page: Page, label: typeof slotLabels[number]) {
  const select = page.getByLabel(`Elegir ${label}`);
  await select.selectOption(label === 'Procesador' ? 'cpu-5600'
    : label === 'Motherboard' ? 'mb-b550'
      : label === 'Memoria RAM' ? 'ram-16'
        : label === 'Placa de video' ? 'gpu-4060'
          : label === 'Almacenamiento' ? 'ssd-1tb'
            : label === 'Fuente' ? 'psu-650'
              : label === 'Gabinete' ? 'case-atx' : 'cooler-am4');
}

test.describe('armador de PC', () => {
  test('selecciona ocho piezas, distribuye dos tiendas, suma RAM y no usa contado en cuotas', async ({ page }, testInfo) => {
    const { products } = await installCatalogRoute(page);
    await loadBuilder(page);
    for (const label of slotLabels) await choose(page, label);

    const ram = products.find((product) => product.id === 'ram-16');
    const psu = products.find((product) => product.id === 'psu-650');
    if (!ram || !psu) throw new Error('fixtures incompletos');
    await page.getByLabel('Tienda para Memoria RAM').selectOption(JSON.stringify(['store-b', ram.prices[1].url]));
    await page.getByLabel('Tienda para Fuente').selectOption(JSON.stringify(['store-b', psu.prices[1].url]));
    await page.getByLabel('Cantidad de Memoria RAM').selectOption('2');
    const shipping = page.getByRole('spinbutton');
    await expect(shipping).toHaveCount(2);
    await shipping.nth(0).fill('10000');
    await shipping.nth(1).fill('15000');

    for (const label of slotLabels) await expect(page.getByLabel(`Elegir ${label}`)).not.toHaveValue('');
    await expect(page.getByTestId('build-total')).toContainText('825.000');
    await page.screenshot({ path: testInfo.outputPath('pc-builder-desktop.png'), fullPage: true });
    await page.getByLabel('Forma de pago').selectOption('installments');
    await expect(page.getByText('Piezas cotizadas').locator('..').locator('dd')).toContainText(/\$\s*0/);
    await expect(page.getByTestId('build-total')).not.toContainText('800.000');
    await expect(page.getByText('8 piezas sin cotización válida')).toBeVisible();
  });

  test('guarda, recupera y comparte IDs sin precios, y descarga precio con fecha', async ({ page }) => {
    const { products } = await installCatalogRoute(page);
    await loadBuilder(page);
    await choose(page, 'Procesador');

    await page.getByRole('button', { name: 'Guardar armado' }).click();
    await expect(page.locator('p[role="status"]')).toContainText('Armado guardado');
    await page.getByRole('button', { name: 'Quitar Procesador' }).click();
    await expect(page.getByLabel('Elegir Procesador')).toHaveValue('');
    await page.getByRole('button', { name: 'Recuperar guardado' }).click();
    await expect(page.getByLabel('Elegir Procesador')).toHaveValue('cpu-5600');

    await page.getByRole('button', { name: 'Copiar enlace' }).click();
    const sharedUrl = await page.getByLabel('Enlace para compartir').inputValue();
    expect(sharedUrl).toContain('#pc=');
    const encoded = new URLSearchParams(new URL(sharedUrl).hash.slice(1)).get('pc')!;
    const sharedDraft = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    expect(sharedDraft.selections.cpu).toEqual({ ...refreshTarget, quantity: 1 });
    expect(JSON.stringify(sharedDraft)).not.toMatch(/price|lastUpdated|100000/);

    await expect(page.getByRole('link', { name: 'Ir a la tienda ↗', exact: true })).toHaveAttribute('href', refreshTarget.url);
    const whatsappHref = await page.getByRole('link', { name: 'Compartir por WhatsApp ↗' }).getAttribute('href');
    expect(whatsappHref).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const whatsappMessage = new URL(whatsappHref!).searchParams.get('text') ?? '';
    expect(whatsappMessage).toContain(sharedUrl);

    await page.goto(sharedUrl);
    await expect(page.getByLabel('Elegir Procesador')).toHaveValue('cpu-5600');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar presupuesto' }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    let text = '';
    if (stream) for await (const chunk of stream) text += chunk.toString();
    expect(download.suggestedFilename()).toBe('presupuesto-pc.txt');
    expect(text).toContain('100.000');
    expect(text).toContain('Fecha de oferta:');
    expect(text).toContain(products[0].prices[0].url);
    expect(text).toContain('21/9/2026');
  });

  test('actualización queued y partial conserva el precio, y un 503 no muestra falso éxito', async ({ page }) => {
    const { state } = await installCatalogRoute(page);
    let refreshCount = 0;
    await page.route('**/api/catalog/refresh**', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        refreshCount += 1;
        if (refreshCount === 3) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Servicio temporalmente no disponible' }) });
          return;
        }
        if (refreshCount === 1) state.refreshed = true;
        await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job: {
          id: `123e4567-e89b-12d3-a456-42661417400${refreshCount}`,
          status: 'queued',
          targets: [refreshTarget],
          results: [],
          created_at: '2026-09-21T12:00:00.000Z',
          started_at: null,
          finished_at: null,
          expires_at: '2026-09-21T13:00:00.000Z',
        } }) });
        return;
      }
      const stateName = refreshCount === 1 ? 'updated' : 'failed';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job: {
        id: `123e4567-e89b-12d3-a456-42661417400${refreshCount}`,
        status: refreshCount === 1 ? 'completed' : 'partial',
        targets: [refreshTarget],
        results: [{ ...refreshTarget, state: stateName, observedAt: stateName === 'updated' ? '2026-09-21T12:05:00.000Z' : null }],
        created_at: '2026-09-21T12:00:00.000Z',
        started_at: '2026-09-21T12:01:00.000Z',
        finished_at: '2026-09-21T12:05:00.000Z',
        expires_at: '2026-09-21T13:00:00.000Z',
      } }) });
    });
    await loadBuilder(page);
    await choose(page, 'Procesador');
    const total = page.getByTestId('build-total');
    await expect(total).toContainText('100.000');

    await page.getByRole('button', { name: 'Actualizar estas ofertas' }).click();
    await expect(page.getByRole('status')).toContainText('1 ofertas actualizadas', { timeout: 12_000 });
    await expect(total).toContainText('120.000');

    await page.getByRole('button', { name: 'Actualizar estas ofertas' }).click();
    await expect(page.getByRole('status')).toContainText('conservamos sus fechas anteriores', { timeout: 12_000 });
    await expect(total).toContainText('120.000');

    await page.getByRole('button', { name: 'Actualizar estas ofertas' }).click();
    await expect(page.getByRole('status')).toContainText('Servicio temporalmente no disponible');
    await expect(page.getByRole('status')).not.toContainText('ofertas actualizadas');
  });

  test('no desborda horizontalmente en viewport móvil de 390px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installCatalogRoute(page);
    await loadBuilder(page);
    for (const label of slotLabels) await choose(page, label);

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 5);
    await page.screenshot({ path: testInfo.outputPath('pc-builder-mobile.png'), fullPage: true });
  });
});
