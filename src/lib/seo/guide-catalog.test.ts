import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({ readGuideCatalogCandidatesFromDatabase: vi.fn(), readProductByIdFromDatabase: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({
  readGuideCatalogCandidatesFromDatabase: mocks.readGuideCatalogCandidatesFromDatabase,
  readProductByIdFromDatabase: mocks.readProductByIdFromDatabase,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { loadGuideCatalogProducts, loadGuidePriorityProducts } from './guide-catalog';
import { getBudgetGuideBySlug } from './budget-guides-data';
import { resolveGuideComponent } from './budget-guide-pricing';
import { planGuideGroups } from '@/lib/catalog/priority-planning';

describe('modelos prioritarios de la guía', () => {
  it('distingue el error de una referencia editorial y vuelve a leer sin memorizar el corte parcial', async () => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    const guide = structuredClone(getBudgetGuideBySlug('pc-gamer-1-millon')!);
    guide.components.cpu.referenceProductIds = ['reference'];
    const reference = { id: 'reference', category: 'procesadores', updatedAt: new Date('2026-10-01T00:00:00Z') } as Product;
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset().mockResolvedValue([]);
    mocks.readProductByIdFromDatabase.mockReset().mockRejectedValueOnce(new Error('database timeout')).mockResolvedValue(reference);
    expect(await fresh.loadGuideCatalogSnapshot(guide)).toEqual({ products: [], unavailableSlots: ['cpu'] });
    expect(await fresh.loadGuideCatalogSnapshot(guide)).toEqual({ products: [reference], unavailableSlots: [] });
    expect(mocks.readProductByIdFromDatabase).toHaveBeenCalledTimes(2);
    expect(reference.updatedAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('conserva las alternativas del mapper de guía y rechaza una referencia con otra categoría', async () => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    const guide = structuredClone(getBudgetGuideBySlug('pc-gamer-1-millon')!);
    guide.components.cpu.referenceProductIds = ['same', 'wrong-category', 'missing'];
    const candidate = { id: 'same', category: 'procesadores', prices: [{ price: 100 }, { price: 200 }] } as Product;
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset().mockImplementation(async (category: string) => category === 'procesadores' ? [candidate] : []);
    mocks.readProductByIdFromDatabase.mockReset().mockImplementation(async (id: string) => id === 'same'
      ? { ...candidate, prices: candidate.prices.slice(0, 1) } : id === 'missing' ? null : { id, category: 'motherboards' } as Product);
    expect(await fresh.loadGuideCatalogSnapshot(guide)).toEqual({ products: [candidate], unavailableSlots: [] });
  });

  it('limita y memoriza referencias sin superar seis lecturas simultáneas entre piezas', async () => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    const guide = structuredClone(getBudgetGuideBySlug('pc-gamer-1-millon')!);
    for (const spec of Object.values(guide.components)) {
      spec.referenceProductIds = Array.from({ length: 5 }, (_, index) => `${spec.category}:${index}`);
    }
    let inFlight = 0;
    let peak = 0;
    const wait = async () => { inFlight += 1; peak = Math.max(peak, inFlight); await new Promise((resolve) => setTimeout(resolve, 5)); inFlight -= 1; };
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset().mockImplementation(async () => { await wait(); return []; });
    mocks.readProductByIdFromDatabase.mockReset().mockImplementation(async (id: string) => { await wait(); return { id, category: id.split(':')[0] } as Product; });
    const first = await fresh.loadGuideCatalogSnapshot(guide);
    expect(first.products).toHaveLength(21);
    expect(await fresh.loadGuideCatalogSnapshot(guide)).toEqual(first);
    expect(mocks.readProductByIdFromDatabase).toHaveBeenCalledTimes(21);
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it.each(['pc-gamer-2-millones', 'pc-gamer-3-millones'])('rescata la referencia CPU de %s desplazada por ocho variantes recientes', async (slug) => {
    vi.resetModules();
    const fresh = await import('./guide-catalog');
    const guide = getBudgetGuideBySlug(slug)!;
    const number = slug === 'pc-gamer-2-millones' ? '5700' : '7600';
    const family = number === '5700' ? '7' : '5';
    const now = new Date();
    const cpu = (id: string, name: string, date = now): Product => ({
      id, name, category: 'procesadores', brand: 'AMD', model: name, specs: {},
      lowestPrice: 300_000, highestPrice: 300_000, averagePrice: 300_000, createdAt: now, updatedAt: now,
      prices: [{ storeId: 'compragamer', storeName: 'CompraGamer', price: 300_000, stock: 'in-stock', installment: null,
        url: `https://compragamer.com/producto/Procesador_AMD_Ryzen_${family}_${number}_AM${number === '5700' ? '4' : '5'}_Wraith_Stealth_Cooler_${number === '5700' ? '15474' : '14309'}`,
        lastUpdated: date }],
    });
    const truncated = Array.from({ length: 8 }, (_, index) => cpu(`wrong-${index}`, `AMD Ryzen ${family} ${number}X sin cooler`));
    const reference = cpu('known-cpu', `AMD Ryzen ${family} ${number} + Wraith Stealth Cooler`);
    const custom = { ...guide, components: { ...guide.components, cpu: { ...guide.components.cpu, referenceProductIds: [reference.id] } } };
    mocks.readGuideCatalogCandidatesFromDatabase.mockReset().mockImplementation(async (category: string) => category === 'procesadores' ? truncated : []);
    mocks.readProductByIdFromDatabase.mockReset().mockResolvedValue(reference);
    expect(resolveGuideComponent(guide.components.cpu, truncated).offers).toEqual([]);
    expect(planGuideGroups(guide, truncated).find((group) => group.key.endsWith('/cpu'))?.targets).toEqual([]);

    const snapshot = await fresh.loadGuideCatalogSnapshot(custom);
    expect(snapshot.unavailableSlots).toEqual([]);
    expect(resolveGuideComponent(custom.components.cpu, snapshot.products).productId).toBe(reference.id);
    expect(mocks.readProductByIdFromDatabase).toHaveBeenCalledWith(reference.id);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('procesadores', 8, guide.components.cpu.searchTerms[0]);

    const observedAt = new Date(now.getTime() - 4 * 60 * 60_000);
    reference.prices[0].lastUpdated = observedAt;
    expect(resolveGuideComponent(custom.components.cpu, snapshot.products).offers).toEqual([]);
    expect(planGuideGroups(custom, snapshot.products).find((group) => group.key.endsWith('/cpu')))
      .toMatchObject({ covered: false, targets: [{ productId: reference.id, storeId: 'compragamer', url: reference.prices[0].url }] });
    expect(reference.prices[0].lastUpdated).toEqual(observedAt);
  });

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
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('memoria-ram', 8, 'mancer 16gb ddr4 3200 vant');
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('gabinetes', 8, 'antec vx310');
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
