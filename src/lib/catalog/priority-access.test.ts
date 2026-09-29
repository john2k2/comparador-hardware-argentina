import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ ensureAccess: vi.fn(), runPriorityRefresh: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin/catalog-refresh/access', () => ({ ensureAccess: mocks.ensureAccess }));
vi.mock('./priority-refresh', () => ({ runPriorityRefresh: mocks.runPriorityRefresh }));
import { POST } from '@/app/api/admin/catalog-refresh/priority/route';
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it('impide ejecutar scrapers sin autorización o fuera del runner', async () => {
  const request = new NextRequest('https://comparador.test/api/admin/catalog-refresh/priority?sample=1', { method: 'POST' });
  mocks.ensureAccess.mockResolvedValue(null);
  expect((await POST(request)).status).toBe(401);
  mocks.ensureAccess.mockResolvedValue('cron');
  expect((await POST(request)).status).toBe(409);
  expect(mocks.runPriorityRefresh).not.toHaveBeenCalled();
});
it('el runner recibe únicamente la opción de muestra, sin destinos enviados por el cliente', async () => {
  vi.stubEnv('CATALOG_REQUESTED_RUNNER', '1'); mocks.ensureAccess.mockResolvedValue('cron');
  mocks.runPriorityRefresh.mockResolvedValue({ source: 'priority-known-offers' });
  const response = await POST(new NextRequest('http://localhost/api/admin/catalog-refresh/priority?sample=1&url=https://arbitrary.test', { method: 'POST' }));
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(mocks.runPriorityRefresh).toHaveBeenCalledWith(true);
});
