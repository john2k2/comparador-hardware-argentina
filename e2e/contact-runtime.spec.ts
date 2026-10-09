import { test, expect } from './fixtures/deterministic.fixture';

test('contacto limpio, asesoría y navegación conservan el correo operativo', async ({ page }) => {
  for (const path of ['/contacto', '/contacto?intent=pc_advisory']) {
    await page.goto(path);
    const links = page.locator('a[href^="mailto:qa@example.test"]');
    await expect(links).toHaveCount(3);
    await expect(page.getByText('Canal de correo pendiente')).toHaveCount(0);
  }
  await page.goto('/guia/armar');
  await page.locator('a[href="/contacto#asesoria-pc"]').first().click();
  await expect(page).toHaveURL(/\/contacto#asesoria-pc$/);
  await expect(page.locator('#asesoria-pc a[href^="mailto:qa@example.test"]')).toBeVisible();
  // Se inspecciona el borrador; no se abre el cliente de correo ni se envía.
  await expect(page.locator('#asesoria-pc a')).toHaveAttribute('href', /subject=/);
});
