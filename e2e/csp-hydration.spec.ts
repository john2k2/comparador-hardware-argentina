import { expect, test } from '@playwright/test';

test('CSP permite hidratar Next.js y cambiar el formulario de cuenta', async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { scriptCspViolations: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      if (event.effectiveDirective.startsWith('script-src')) {
        violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
      }
    });
  });

  const response = await page.goto('/auth');
  const policy = response?.headers()['content-security-policy'];
  const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();

  // Estos scripts los genera Next.js, no el layout de la aplicación.
  const flightNonces = await page.locator('script').evaluateAll((scripts) => scripts
    .filter((script) => script.textContent?.includes('self.__next_f'))
    .map((script) => (script as HTMLScriptElement).nonce));
  expect(flightNonces.length).toBeGreaterThan(0);
  expect(flightNonces.every((value) => value === nonce)).toBe(true);

  await page.getByRole('button', { name: 'CREAR CUENTA', exact: true }).click();
  await expect(page.locator('button[type="submit"]')).toHaveText('CREAR CUENTA');
  await expect(page.locator('input[type="password"]')).toHaveAttribute('autocomplete', 'new-password');
  expect(await page.evaluate(() => Reflect.get(window, 'scriptCspViolations'))).toEqual([]);
});
