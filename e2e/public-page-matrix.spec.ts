import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { publicRoutes as routes } from './fixtures/public-routes';

const artifactRoot = 'outputs/e2e-review-2026-10-05/page-matrix';
for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  for (const route of routes) {
    test(`${viewport.width}px ${route} has a usable page, no fatal JS and no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => { localStorage.setItem('theme', 'dark'); });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('main h1')).toBeVisible();
      const reject = page.getByRole('button', {name:'Rechazar analítica',exact:true});
      if (await reject.isVisible()) await reject.click();
      const closePrivacy = page.getByRole('button', {name:'Cerrar preferencias',exact:true});
      if (await closePrivacy.isVisible()) await closePrivacy.click();
      if (route === '/guia/armar') {
        await expect(page.getByRole('button', {name:'Armar PC',exact:true})).toBeEnabled();
        await expect(page.getByRole('combobox', {name:'Elegir Procesador',exact:true})).toBeEnabled();
      }
      if (route === '/juegos-digitales') {
        await expect(page.getByText('Consultando la muestra de precios…', {exact:true})).toHaveCount(0);
        await expect(page.getByRole('region', {name:'Selección de juegos',exact:true})).not.toBeEmpty();
      }
      if (route === '/comparativa/comparar') {
        await expect(page.getByRole('textbox', {name:'Buscar producto A',exact:true})).toBeEnabled();
      }
      await page.locator('main h1').evaluate(async () => { await document.fonts.ready; });
      const geometry = await page.locator('html').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
      expect(geometry.scrollWidth-geometry.width).toBeLessThanOrEqual(1);
      await expect(page.locator('a[href^="/indice-precios-hardware"]')).toHaveCount(0);
      await expect(page.locator('script[src*="adsbygoogle"]')).toHaveCount(0);
      expect(errors).toEqual([]);
      mkdirSync(artifactRoot,{recursive:true});
      const filename = `${viewport.width}-${route.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'')||'home'}`;
      await page.screenshot({path:`${artifactRoot}/${filename}.png`,fullPage:true});
      writeFileSync(`${artifactRoot}/${filename}.json`,JSON.stringify({route,viewport,geometry,errors,screenshot:`${filename}.png`},null,2));
    });
  }
}
