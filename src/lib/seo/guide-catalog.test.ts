import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({ readGuideCatalogCandidatesFromDatabase: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({
  readGuideCatalogCandidatesFromDatabase: mocks.readGuideCatalogCandidatesFromDatabase,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { loadGuideCatalogProducts, loadGuidePriorityProducts } from './guide-catalog';
import { getBudgetGuideBySlug } from './budget-guides-data';

describe('modelos prioritarios de la guía', () => {
  it('reintenta la próxima consulta tras un error, sin esperar el TTL ni cambiar fechas', async () => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    const product = { id: 'recoverable-cpu', updatedAt: new Date('2026-10-01T00:00:00Z') } as Product;
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset()
      .mockRejectedValueOnce(new Error('database timeout'))
      .mockResolvedValueOnce([product]);

    await expect(fresh.loadGuidePriorityProducts('procesadores', ['ryzen 5500'])).rejects.toThrow('GUIDE_CATALOG_UNAVAILABLE');
    expect(await fresh.loadGuidePriorityProducts('procesadores', ['ryzen 5500'])).toEqual([product]);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledTimes(2);
    expect(product.updatedAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('conserva las lecturas válidas y separa un fallo de RAM de una GPU sin coincidencias', async () => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    const guide = getBudgetGuideBySlug('pc-gamer-1-millon')!;
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset().mockImplementation(async (category: string) => {
      if (category === 'memoria-ram') throw new Error('database timeout');
      if (category === 'tarjetas-graficas') return [];
      return [{ id: category }] as Product[];
    });

    const first = await fresh.loadGuideCatalogSnapshot(guide);
    expect(first.unavailableSlots).toEqual(['ram']);
    expect(first.products).toHaveLength(5);
    await expect(fresh.loadGuideCatalogProducts(guide)).rejects.toThrow('GUIDE_CATALOG_UNAVAILABLE');

    mocks.readGuideCatalogCandidatesFromDatabase.mockImplementation(async (category: string) => [{ id: category }] as Product[]);
    const recovered = await fresh.loadGuideCatalogSnapshot(guide);
    expect(recovered.unavailableSlots).toEqual([]);
    expect(recovered.products).toHaveLength(6);
    expect(recovered.products.some((product) => product.id === 'memoria-ram')).toBe(true);
    // La respuesta vacía de GPU sí fue válida y conserva su caché.
    expect(recovered.products.some((product) => product.id === 'tarjetas-graficas')).toBe(false);
  });

  it('no memoriza como completa una consulta de dos modelos cuando falla uno', async () => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset().mockImplementation(async (_category: string, _limit: number, query: string) => {
      if (query === 'second') throw new Error('database timeout');
      return [{ id: query }] as Product[];
    });
    await expect(fresh.loadGuidePriorityProducts('tarjetas-graficas', ['first', 'second'])).rejects.toThrow('GUIDE_CATALOG_UNAVAILABLE');
    mocks.readGuideCatalogCandidatesFromDatabase.mockImplementation(async (_category: string, _limit: number, query: string) => [{ id: query }] as Product[]);
    expect(await fresh.loadGuidePriorityProducts('tarjetas-graficas', ['first', 'second'])).toEqual([{ id: 'first' }, { id: 'second' }]);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledTimes(4);
  });

  it('rescata GPUs específicas fuera del top general sin repetir consultas en el TTL', async () => {
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset();
    mocks.readGuideCatalogCandidatesFromDatabase.mockImplementation(async (_category: string, _limit: number, query: string) => [
      { id: `gpu-${query}`, name: query },
    ] as Product[]);

    const first = await loadGuidePriorityProducts('tarjetas-graficas', ['rtx 4060', 'rx 7600']);
    const second = await loadGuidePriorityProducts('tarjetas-graficas', ['rtx 4060', 'rx 7600']);

    expect(first.map((product) => product.id)).toEqual(['gpu-rtx 4060', 'gpu-rx 7600']);
    expect(second).toEqual(first);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledTimes(2);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('tarjetas-graficas', 8, 'rtx 4060');
  });

  it('busca las siete piezas por sus modelos sin depender del top general de cada categoría', async () => {
    mocks.readGuideCatalogCandidatesFromDatabase.mockClear();
    const guide = getBudgetGuideBySlug('pc-gamer-1-millon')!;
    await loadGuideCatalogProducts(guide);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('memoria-ram', 8, 'mancer 16gb ddr4 3200 vant', expect.objectContaining({ exactModel: 'Vant S' }));
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('gabinetes', 8, 'antec vx310', expect.objectContaining({ exactModel: 'VX310' }));
    expect(mocks.readGuideCatalogCandidatesFromDatabase.mock.calls.every((call) => call[1] === 8 && call[2])).toBe(true);
    expect(new Set(mocks.readGuideCatalogCandidatesFromDatabase.mock.calls.map((call) => call[0])).size).toBe(7);
  });

  it('resuelve varias piezas a la vez sin superar seis lecturas simultáneas', async () => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset();
    let inFlight = 0;
    let peak = 0;
    mocks.readGuideCatalogCandidatesFromDatabase.mockImplementation(async (category: string, _limit: number, query: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return [{ id: `${category}-${query}`, name: query }] as Product[];
    });

    const guide = getBudgetGuideBySlug('pc-gamer-1-millon')!;
    const products = await fresh.loadGuideCatalogProducts(guide);

    expect(fresh.GUIDE_COMPONENT_CONCURRENCY).toBe(3);
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThanOrEqual(6);
    expect(new Set(products.map((product) => product.id)).size).toBe(mocks.readGuideCatalogCandidatesFromDatabase.mock.calls.length);
  });
});


it('separa caché por presentación editorial aunque los términos no cambien', async () => {
  vi.resetModules();
  const fresh = await import('./guide-catalog');
  const guide = structuredClone(getBudgetGuideBySlug('pc-gamer-2-millones')!);
  mocks.readGuideCatalogCandidatesFromDatabase.mockReset().mockResolvedValue([]);
  await fresh.loadGuideCatalogProducts(guide);
  mocks.readGuideCatalogCandidatesFromDatabase.mockClear();
  guide.components.cpu.requiresIncludedCooler = false;
  await fresh.loadGuideCatalogProducts(guide);
  expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledTimes(1);
  expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('procesadores', 8, 'ryzen 7 5700',
    expect.objectContaining({ requiresIncludedCooler: false }));
});
