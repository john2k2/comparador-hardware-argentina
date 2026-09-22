import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { evaluateOfferIdentity, JEV_MODEL } from '@/lib/ai/jev-client';

vi.mock('server-only', () => ({}));

// Opt-in explícito: la suite habitual no consume cuota ni necesita una clave.
it.skipIf(process.env.JEV_LIVE_SMOKE !== '1')('verifica el adaptador contra TypeSafe con dos textos públicos', async () => {
  const result = await evaluateOfferIdentity([
    { name: 'Patriot Viper Venom DDR5 32GB 2x16GB 6000MHz RGB CL30', category: 'memoria-ram', offerText: 'patriot viper venom 32gb 2x16gb ddr5 6000mhz rgb cl30' },
    { name: 'AMD Ryzen 5 5600 AM4 3.5 GHz', category: 'procesadores', offerText: 'micro amd ryzen 5 5600 4.4 ghz am4' },
  ], process.env.TYPESAFE_API_KEY ?? '');
  expect(result.model).toBe(JEV_MODEL);
  expect(result.answers).toHaveLength(2);
  await mkdir('tmp', { recursive: true });
  await writeFile('tmp/jev-live-smoke-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
}, 10_000);
