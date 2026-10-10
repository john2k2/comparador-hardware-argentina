import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readGuideCatalogCandidatesFromDatabase: vi.fn(async () => []), readProductByIdFromDatabase: vi.fn<(id: string) => Promise<Product | null>>(async () => null) }));
vi.mock('@/lib/persistence/product-read', () => ({
  readGuideCatalogCandidatesFromDatabase: mocks.readGuideCatalogCandidatesFromDatabase,
  readProductByIdFromDatabase: mocks.readProductByIdFromDatabase,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { loadGuideCatalogProducts } from './guide-catalog';
import { getBudgetGuideBySlug } from './budget-guides-data';
import { getEditorialMethodology } from './editorial-methodology';
import { resolveGuideComponent } from './budget-guide-pricing';
import type { Product } from '@/lib/types';

describe('consulta de la selección editorial de guías', () => {
  it('consulta los siete modelos de la nueva selección AM4 antes del límite de candidatas', async () => {
    const guide = getBudgetGuideBySlug('pc-gamer-2-millones')!;
    const original = structuredClone(guide);
    await loadGuideCatalogProducts(guide);

    for (const spec of Object.values(guide.components)) {
      expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith(spec.category, 8, spec.searchTerms[0], expect.objectContaining({ name: spec.name, exactModel: spec.exactModel }));
      expect(spec.exactModel).toBeTruthy();
    }
    expect(guide.components.cpu).toMatchObject({ exactModel: 'Ryzen 7 5700', searchTerms: ['ryzen 7 5700'] });
    expect(mocks.readProductByIdFromDatabase.mock.calls.map(([id]) => id)).toEqual(guide.components.cpu.referenceProductIds);
    expect(guide.components.ram.name).toContain('DDR4 3200MHz CL19 (1 módulo)');
    expect(guide.components.motherboard.exactModel).toBe('B550M-HDV');
    expect(guide.components.psu).toMatchObject({ exactModel: 'Steel Legend', searchTerms: ['asrock 750w steel legend'] });
    expect(guide.budget).toBe(2_000_000);
    expect(guide).toEqual(original);
  });

  it('conserva las variantes CL19 y CL36 y expone límites de plataforma y accesorios', () => {
    const entry = getBudgetGuideBySlug('pc-gamer-1-millon')!;
    const mid = getBudgetGuideBySlug('pc-gamer-2-millones')!;
    const upper = getBudgetGuideBySlug('pc-gamer-3-millones')!;
    expect(entry.components.ram.name).toContain('CL19');
    expect(upper.components.ram.name).toContain('CL36 (2x16GB)');
    expect(mid.components.gpu.name).toContain('16GB Challenger OC');
    expect(mid.components.ssd.description).toContain('PCIe 3.0');
    expect(mid.tips.join(' ')).toContain('no tiene botón BIOS Flashback');
    expect(mid.tips.join(' ')).toContain('no incluye cable a 220 V');
    expect(entry.faqs.map((faq) => faq.answer).join(' ')).not.toContain('por debajo del millón');
  });

  it('resuelve la fuente por su título real aunque el SKU SL-750G esté solo en especificaciones', () => {
    const now = new Date();
    const source: Product = {
      id: 'cg-18173', name: 'Fuente Asrock 750W 80 Plus Gold Steel Legend Full Modular ATX 3.1 PCIe 5.1 Cybenetics Platinum',
      model: 'Fuente Asrock 750W 80 Plus Gold Steel Legend Full Modular ATX 3.1 PCIe 5.1 Cybenetics Platinum',
      category: 'fuentes-alimentacion', brand: 'Asrock', specs: { SKU: 'SL-750G' },
      prices: [{ storeId: 'compragamer', storeName: 'CompraGamer', price: 130_850, stock: 'in-stock',
        url: 'https://compragamer.com/producto/Fuente_Asrock_750W_80_Plus_Gold_Steel_Legend_Full_Modular_ATX_3_1_PCIe_5_1_Cybenetics_Platinum_18173',
        installment: null, lastUpdated: now }],
      lowestPrice: 130_850, highestPrice: 130_850, averagePrice: 130_850, createdAt: now, updatedAt: now,
    };
    const spec = getBudgetGuideBySlug('pc-gamer-2-millones')!.components.psu;
    expect(resolveGuideComponent(spec, [source])).toMatchObject({ priceSource: 'catalog', productId: 'cg-18173', price: 130_850 });
    const differentModel = { ...source, name: source.name.replace('750W', '850W'), model: source.model.replace('750W', '850W'),
      specs: { SKU: 'SL-850G' }, prices: [{ ...source.prices[0], url: source.prices[0].url.replace('750W', '850W') }] };
    expect(resolveGuideComponent(spec, [differentModel]).priceSource).toBe('estimate');
    expect(resolveGuideComponent(spec, [{ ...source, prices: [{ ...source.prices[0], lastUpdated: new Date(now.getTime() - 4 * 60 * 60_000) }] }]).priceSource).toBe('estimate');
  });

  it('fecha las guías revisadas y alinea fuentes y límites de la nueva selección', () => {
    for (const slug of ['pc-gamer-1-millon', 'pc-gamer-2-millones', 'pc-gamer-3-millones']) {
      expect(getEditorialMethodology(slug)?.updatedAt).toBe('2026-10-09');
    }
    const method = getEditorialMethodology('pc-gamer-2-millones')!;
    const text = method.sections.map((section) => section.text).join(' ');
    expect(text).toContain('BIOS P2.10');
    expect(text).toContain('no certificamos este código en su QVL');
    expect(text).toContain('no rejuvenece');
    expect(method.sources.some((source) => source.url.includes('u=693'))).toBe(true);
    expect(method.sources.some((source) => source.url.includes('PRO-B650M-B'))).toBe(false);
  });
});
