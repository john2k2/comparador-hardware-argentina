import { test } from '@playwright/test';
import '../e2e/pc-builder.spec';
import '../e2e/comparison-return.spec';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !['GET', 'HEAD'].includes(request.method())) {
      await route.abort();
      return;
    }
    await route.fallback();
  });
});
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'passed') {
    await page.screenshot({ path: testInfo.outputPath('resultado-fixture.png'), fullPage: true });
  }
});
