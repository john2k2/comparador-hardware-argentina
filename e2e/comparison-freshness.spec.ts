import { expect, test } from '@playwright/test';

const now = new Date('2026-10-05T18:00:00.000Z');
function product(id: string, name: string, price: number, ageHours: number) {
  return {
    id, name, model: name, brand: name.startsWith('RTX') ? 'MSI' : 'ASRock', category: 'tarjetas-graficas', specs: {},
    prices: [{storeId:'mexx',storeName:'Mexx',url:`https://www.mexx.com.ar/product/${id}`,price,stock:'in-stock',installment:null,
      lastUpdated:new Date(now.getTime()-ageHours*60*60*1000).toISOString()}],
    lowestPrice:price,highestPrice:price,averagePrice:price,createdAt:now.toISOString(),updatedAt:now.toISOString(),
  };
}

for (const ageHours of [1,4]) {
  test(`la comparación usa las referencias de ${ageHours} h y sólo recomienda con precios de hasta 3 h`, async ({page}) => {
    await page.clock.install({time:now});
    const left = product('comparison-4060','RTX 4060',400_000,1);
    const right = product('comparison-7600','RX 7600',300_000,ageHours);
    await page.route('**/api/products?**',async route => {
      const q = new URL(route.request().url()).searchParams.get('q') ?? '';
      await route.fulfill({json:{products:q.includes('4060') ? [left] : [right]}});
    });
    await page.goto('/comparativa/comparar');
    await page.getByLabel('TIPO DE COMPONENTE',{exact:true}).selectOption('tarjetas-graficas');
    for (const [side,query,name] of [['A','4060',left.name],['B','7600',right.name]]) {
      const input = page.getByRole('textbox',{name:`Buscar producto ${side}`,exact:true});
      await input.fill(query);
      await input.press('Enter');
      await page.getByRole('button',{name:new RegExp(name)}).click();
    }
    const decision = page.locator('section').filter({has:page.getByRole('heading',{name:'[ ¿CUÁL CONVIENE? ]',exact:true})});
    const prices = page.locator('table').filter({hasText:'Mejor precio reciente (24 h)'});
    const ratios = page.getByText(/puntos de .* por cada \$100.000/);
    await expect(prices).toContainText('400.000');
    await expect(prices).toContainText('300.000');
    if (ageHours === 1) {
      await expect(decision).toContainText('RX 7600 conviene más');
      await expect(decision).toContainText('últimas tres horas');
      await expect(ratios).toHaveCount(2);
      await page.clock.fastForward(2*60*60*1000+1);
      await expect(decision).toContainText('No hay dos precios recientes');
      await expect(prices).toContainText('300.000');
      await expect(decision).not.toContainText('RX 7600 conviene más');
      await expect(ratios).toHaveCount(0);
    } else {
      await expect(decision).toContainText('No hay dos precios recientes');
      await expect(decision).not.toContainText('RX 7600 conviene más');
      await expect(decision).toContainText('referencias del catálogo');
      await expect(ratios).toHaveCount(1);
    }
  });
}

test('cambiar A limpia su búsqueda y el resultado, conserva B y permite una nueva selección',async ({page}) => {
  await page.clock.setFixedTime(now);
  const left = product('comparison-4060','RTX 4060',400_000,1);
  const right = product('comparison-7600','RX 7600',300_000,1);
  await page.route('**/api/products?**',async route => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    await route.fulfill({json:{products:q.includes('4060') ? [left] : [right]}});
  });
  await page.goto('/comparativa/comparar');
  await page.getByLabel('TIPO DE COMPONENTE',{exact:true}).selectOption('tarjetas-graficas');
  for (const [side,query,name] of [['A','4060',left.name],['B','7600',right.name]]) {
    const input=page.getByRole('textbox',{name:`Buscar producto ${side}`,exact:true});
    await input.fill(query);await input.press('Enter');
    await page.getByRole('button',{name:new RegExp(name)}).click();
  }
  const decision=page.getByRole('heading',{name:'[ ¿CUÁL CONVIENE? ]',exact:true});
  await expect(decision).toBeVisible();
  await page.getByRole('button',{name:'Cambiar producto A',exact:true}).click();
  await expect(decision).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Buscar producto A',exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:/RTX 4060/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Cambiar producto B',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Buscar producto B',exact:true})).toHaveCount(0);
  const input=page.getByRole('textbox',{name:'Buscar producto A',exact:true});
  await input.fill('4060');await input.press('Enter');
  await page.getByRole('button',{name:/RTX 4060/}).click();
  await expect(decision).toBeVisible();
});
