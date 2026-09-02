import type { Product } from '@/lib/types';
import { parseListingFlags } from '@/lib/product/listing-flags';
import type { BudgetGuideDefinition } from '@/lib/seo/budget-guides-data';
import {
  compactGpuFromName,
  cpuGamingTier,
  cpuTier,
  gpuPerformanceTier,
  inferCpuSocket,
  inferMotherboardPlatform,
  inferPsuWatts,
  inferRamProfile,
  inferSsdCapacityGb,
  isCurrentGamingCpu,
  isCurrentGamingGpu,
  isDesktopRam,
  isLikelyDesktopCase,
  platformId,
  requiredPsuWatts,
  type PlatformId,
  type PcSocket,
  type RamGen,
} from '@/lib/seo/budget-build-compat';
import {
  listBuyableGuideCandidates,
  resolveGuideComponent,
  summarizeGuideComponents,
  toEstimatedGuideComponent,
  toResolvedCatalogComponent,
  type BuyableGuideCandidate,
  type ResolvedGuideComponent,
  type ResolvedGuideSlotTotals,
} from '@/lib/seo/budget-guide-pricing';

export const GUIDE_SLOT_KEYS = [
  'cpu',
  'gpu',
  'ram',
  'ssd',
  'motherboard',
  'psu',
  'case',
] as const;

export type GuideSlotKey = (typeof GUIDE_SLOT_KEYS)[number];

export const GUIDE_SLOT_LABELS: Record<GuideSlotKey, string> = {
  cpu: 'PROCESADOR',
  gpu: 'PLACA DE VIDEO',
  ram: 'MEMORIA RAM',
  ssd: 'ALMACENAMIENTO',
  motherboard: 'MOTHERBOARD',
  psu: 'FUENTE',
  case: 'GABINETE',
};

type PricedPart = BuyableGuideCandidate & {
  socket?: PcSocket | null;
  ramGen?: RamGen | null;
  watts?: number | null;
  capacityGb?: number | null;
};

export type CatalogBuild = {
  platform: PlatformId | null;
  slots: Partial<Record<GuideSlotKey, ResolvedGuideComponent>>;
  total: number;
};

function cheapest(parts: PricedPart[]): PricedPart | undefined {
  return [...parts].sort((left, right) => left.price - right.price)[0];
}

function slotFromPart(part: PricedPart, key: GuideSlotKey): ResolvedGuideComponent {
  return toResolvedCatalogComponent(part.product, part.offers, describePart(key, part.product.name));
}

function describePart(key: GuideSlotKey, name: string): string {
  if (key === 'cpu') {
    const socket = inferCpuSocket(name);
    const flags = parseListingFlags(name);
    const cooler = flags.coolerIncluded === false ? ' Necesita cooler aftermarket.' : '';
    return socket ? `Socket ${socket.toUpperCase()}.${cooler}` : cooler.trim();
  }
  if (key === 'motherboard') {
    const platform = inferMotherboardPlatform(name);
    return platform
      ? `Socket ${platform.socket.toUpperCase()} | ${platform.ramGen.toUpperCase()}`
      : '';
  }
  if (key === 'ram') {
    const profile = inferRamProfile(name);
    return profile
      ? `${profile.gen.toUpperCase()}${profile.capacityGb ? ` | ${profile.capacityGb} GB` : ''}`
      : '';
  }
  if (key === 'psu') {
    const watts = inferPsuWatts(name);
    return watts ? `${watts}W declarados en el listing` : '';
  }
  if (key === 'gpu') {
    return compactGpuFromName(name) ?? '';
  }
  if (key === 'ssd') {
    const gb = inferSsdCapacityGb(name);
    return gb ? (gb >= 1024 ? `${(gb / 1024).toFixed(gb % 1024 === 0 ? 0 : 1)} TB` : `${gb} GB`) : '';
  }
  return '';
}

function indexCatalog(products: Product[]) {
  const cpus: PricedPart[] = listBuyableGuideCandidates(products, 'procesadores')
    .map((candidate) => ({ ...candidate, socket: inferCpuSocket(candidate.product.name) }))
    .filter((candidate) => candidate.socket);

  const gpus: PricedPart[] = listBuyableGuideCandidates(products, 'tarjetas-graficas')
    .filter((candidate) => isCurrentGamingGpu(candidate.product.name));

  const motherboards: PricedPart[] = listBuyableGuideCandidates(products, 'motherboards')
    .flatMap((candidate) => {
      const platform = inferMotherboardPlatform(candidate.product.name);
      if (!platform) return [];
      return [{ ...candidate, socket: platform.socket, ramGen: platform.ramGen }];
    });

  const rams: PricedPart[] = listBuyableGuideCandidates(products, 'memoria-ram')
    .flatMap((candidate) => {
      const profile = inferRamProfile(candidate.product.name);
      if (!profile || !isDesktopRam(profile)) return [];
      return [{ ...candidate, ramGen: profile.gen, capacityGb: profile.capacityGb }];
    });

  const ssds: PricedPart[] = listBuyableGuideCandidates(products, 'almacenamiento')
    .map((candidate) => ({ ...candidate, capacityGb: inferSsdCapacityGb(candidate.product.name) }))
    .filter((candidate) => (candidate.capacityGb ?? 0) >= 480);

  const psus: PricedPart[] = listBuyableGuideCandidates(products, 'fuentes-alimentacion')
    .map((candidate) => ({ ...candidate, watts: inferPsuWatts(candidate.product.name) }))
    .filter((candidate) => (candidate.watts ?? 0) >= 400);

  const cases: PricedPart[] = listBuyableGuideCandidates(products, 'gabinetes')
    .filter((candidate) => isLikelyDesktopCase(candidate.product.name));

  return { cpus, gpus, motherboards, rams, ssds, psus, cases };
}

function ramMatchesSocket(socket: PcSocket, ramGen: RamGen): boolean {
  if (socket === 'am4') return ramGen === 'ddr4';
  if (socket === 'am5') return ramGen === 'ddr5';
  return true;
}

function discoverPlatforms(index: ReturnType<typeof indexCatalog>): PlatformId[] {
  const found = new Set<PlatformId>();
  for (const motherboard of index.motherboards) {
    if (motherboard.socket && motherboard.ramGen) {
      found.add(platformId(motherboard.socket, motherboard.ramGen));
    }
  }
  for (const cpu of index.cpus) {
    if (!cpu.socket) continue;
    for (const ram of index.rams) {
      if (!ram.ramGen) continue;
      if (!ramMatchesSocket(cpu.socket, ram.ramGen)) continue;
      found.add(platformId(cpu.socket, ram.ramGen));
    }
  }
  return [...found];
}

function ramPoolFor(rams: PricedPart[], ramGen: RamGen): PricedPart[] {
  const matching = rams.filter((ram) => ram.ramGen === ramGen);
  const atLeast16 = matching.filter((ram) => (ram.capacityGb ?? 0) >= 16);
  return atLeast16.length > 0 ? atLeast16 : matching.filter((ram) => (ram.capacityGb ?? 0) >= 8);
}

function cpuPoolForGaming(cpus: PricedPart[]): PricedPart[] {
  const current = cpus.filter((cpu) => isCurrentGamingCpu(cpu.product.name));
  if (current.length > 0) return current;
  const decent = cpus.filter((cpu) => cpuGamingTier(cpu.product.name) >= 60);
  return decent.length > 0 ? decent : cpus;
}

function assemblePlatform(
  platform: PlatformId,
  budget: number,
  index: ReturnType<typeof indexCatalog>,
): CatalogBuild | null {
  const [socket, ramGen] = platform.split('-') as [PcSocket, RamGen];
  const cpuPool = cpuPoolForGaming(
    index.cpus.filter((cpu) => cpu.socket === socket),
  );
  const mbPool = index.motherboards.filter((motherboard) => (
    motherboard.socket === socket && motherboard.ramGen === ramGen
  ));
  const ramPool = ramPoolFor(index.rams, ramGen);
  if (cpuPool.length === 0 || ramPool.length === 0) return null;

  const minCpu = cheapest(cpuPool);
  const minMb = cheapest(mbPool);
  const minRam = cheapest(ramPool);
  const minSsd = cheapest(index.ssds);
  const minCase = cheapest(index.cases);
  if (!minCpu || !minRam) return null;

  const fixed = minRam.price
    + (minMb?.price ?? 0)
    + (minSsd?.price ?? 0)
    + (minCase?.price ?? 0);
  if (fixed >= budget) return null;

  const remainingForCpuGpuPsu = budget - fixed;
  const gpuRanked = [...index.gpus].sort((left, right) => {
    const tierDelta = gpuPerformanceTier(right.product.name) - gpuPerformanceTier(left.product.name);
    return tierDelta !== 0 ? tierDelta : left.price - right.price;
  });
  const cpuRanked = [...cpuPool].sort((left, right) => {
    const tierDelta = cpuTier(right.product.name) - cpuTier(left.product.name);
    return tierDelta !== 0 ? tierDelta : left.price - right.price;
  });

  let pickedGpu: PricedPart | undefined;
  let pickedCpu = minCpu;
  let pickedPsu: PricedPart | undefined;

  for (const gpu of gpuRanked) {
    let combo: { cpu: PricedPart; psu: PricedPart } | undefined;
    for (const cpu of cpuRanked) {
      const need = requiredPsuWatts(cpu.product.name, gpu.product.name);
      const psu = cheapest(index.psus.filter((item) => (item.watts ?? 0) >= need));
      if (!psu) continue;
      if (gpu.price + cpu.price + psu.price <= remainingForCpuGpuPsu) {
        combo = { cpu, psu };
        break;
      }
    }
    if (!combo) continue;
    pickedGpu = gpu;
    pickedCpu = combo.cpu;
    pickedPsu = combo.psu;
    break;
  }

  if (!pickedGpu || !pickedPsu) {
    if (minCpu.price > remainingForCpuGpuPsu) return null;
    pickedCpu = cpuRanked.find((cpu) => cpu.price <= remainingForCpuGpuPsu) ?? minCpu;
    if (pickedCpu.price > remainingForCpuGpuPsu) return null;
  }

  let leftover = remainingForCpuGpuPsu
    - pickedCpu.price
    - (pickedGpu?.price ?? 0)
    - (pickedPsu?.price ?? 0);

  let pickedRam = minRam;
  const ramUpgrade = [...ramPool]
    .filter((ram) => ram.price - minRam.price <= leftover)
    .sort((left, right) => (right.capacityGb ?? 0) - (left.capacityGb ?? 0) || left.price - right.price)[0];
  if (ramUpgrade) {
    leftover -= ramUpgrade.price - minRam.price;
    pickedRam = ramUpgrade;
  }

  let pickedSsd = minSsd;
  if (minSsd) {
    const ssdUpgrade = [...index.ssds]
      .filter((ssd) => ssd.price - minSsd.price <= leftover)
      .sort((left, right) => (right.capacityGb ?? 0) - (left.capacityGb ?? 0) || left.price - right.price)[0];
    if (ssdUpgrade) {
      leftover -= ssdUpgrade.price - minSsd.price;
      pickedSsd = ssdUpgrade;
    }
  }

  if (pickedPsu && pickedGpu) {
    const need = requiredPsuWatts(pickedCpu.product.name, pickedGpu.product.name);
    const psuUpgrade = [...index.psus]
      .filter((psu) => (psu.watts ?? 0) >= need && psu.price - pickedPsu.price <= leftover)
      .sort((left, right) => (right.watts ?? 0) - (left.watts ?? 0) || left.price - right.price)[0];
    if (psuUpgrade) pickedPsu = psuUpgrade;
  }

  const slots: CatalogBuild['slots'] = {
    cpu: slotFromPart(pickedCpu, 'cpu'),
    ram: slotFromPart(pickedRam, 'ram'),
  };
  if (minMb) slots.motherboard = slotFromPart(minMb, 'motherboard');
  if (pickedSsd) slots.ssd = slotFromPart(pickedSsd, 'ssd');
  if (minCase) slots.case = slotFromPart(minCase, 'case');
  if (pickedGpu) slots.gpu = slotFromPart(pickedGpu, 'gpu');
  if (pickedPsu) slots.psu = slotFromPart(pickedPsu, 'psu');

  const total = Object.values(slots).reduce((sum, slot) => sum + (slot?.price ?? 0), 0);
  if (total > budget) return null;

  return { platform, slots, total };
}

function catalogCount(build: CatalogBuild): number {
  return Object.values(build.slots).filter((slot) => slot?.priceSource === 'catalog').length;
}

function betterBuild(left: CatalogBuild, right: CatalogBuild): CatalogBuild {
  const leftGpu = left.slots.gpu ? gpuPerformanceTier(left.slots.gpu.name) : -1;
  const rightGpu = right.slots.gpu ? gpuPerformanceTier(right.slots.gpu.name) : -1;
  if (leftGpu !== rightGpu) return leftGpu >= rightGpu ? left : right;
  const leftCpu = left.slots.cpu ? cpuGamingTier(left.slots.cpu.name) : -1;
  const rightCpu = right.slots.cpu ? cpuGamingTier(right.slots.cpu.name) : -1;
  if (leftCpu !== rightCpu) return leftCpu >= rightCpu ? left : right;
  const leftSlots = catalogCount(left);
  const rightSlots = catalogCount(right);
  if (leftSlots !== rightSlots) return leftSlots >= rightSlots ? left : right;
  return left.total >= right.total ? left : right;
}

export function buildBudgetFromCatalog(input: {
  budget: number;
  products: Product[];
}): CatalogBuild {
  const index = indexCatalog(input.products);
  const platforms = discoverPlatforms(index);
  let best: CatalogBuild | null = null;
  for (const platform of platforms) {
    const assembled = assemblePlatform(platform, input.budget, index);
    if (!assembled) continue;
    best = best ? betterBuild(best, assembled) : assembled;
  }
  return best ?? { platform: null, slots: {}, total: 0 };
}

function genericSlotName(key: GuideSlotKey, platform: PlatformId | null): string {
  const socket = platform?.split('-')[0];
  const ramGen = platform?.split('-')[1];
  switch (key) {
    case 'cpu':
      return socket ? `Procesador ${socket.toUpperCase()} (sin stock)` : 'Procesador (sin stock)';
    case 'gpu':
      return 'Placa de video (sin stock)';
    case 'ram':
      return ramGen ? `Memoria ${ramGen.toUpperCase()} (sin stock)` : 'Memoria RAM (sin stock)';
    case 'ssd':
      return 'SSD (sin stock)';
    case 'motherboard':
      return socket ? `Motherboard ${socket.toUpperCase()} (sin stock)` : 'Motherboard (sin stock)';
    case 'psu':
      return 'Fuente (sin stock)';
    case 'case':
      return 'Gabinete (sin stock)';
  }
}

function inferPlatformFromSlots(
  slots: Partial<Record<GuideSlotKey, ResolvedGuideComponent>>,
  fallback: PlatformId | null,
): PlatformId | null {
  if (fallback) return fallback;
  const cpuSocket = slots.cpu ? inferCpuSocket(slots.cpu.name) : null;
  const mb = slots.motherboard ? inferMotherboardPlatform(slots.motherboard.name) : null;
  const ram = slots.ram ? inferRamProfile(slots.ram.name) : null;
  if (mb) return platformId(mb.socket, mb.ramGen);
  if (cpuSocket && ram && ramMatchesSocket(cpuSocket, ram.gen)) {
    return platformId(cpuSocket, ram.gen);
  }
  return null;
}

function isNameCompatible(
  key: GuideSlotKey,
  name: string,
  platform: PlatformId | null,
  current: Partial<Record<GuideSlotKey, ResolvedGuideComponent>>,
): boolean {
  if (!platform) return true;
  const [socket, ramGen] = platform.split('-') as [PcSocket, RamGen];

  if (key === 'cpu') {
    const inferred = inferCpuSocket(name);
    return inferred === socket;
  }
  if (key === 'motherboard') {
    const inferred = inferMotherboardPlatform(name);
    return inferred?.socket === socket && inferred.ramGen === ramGen;
  }
  if (key === 'ram') {
    const inferred = inferRamProfile(name);
    return Boolean(inferred && isDesktopRam(inferred) && inferred.gen === ramGen);
  }
  if (key === 'psu' && current.gpu && current.cpu) {
    const watts = inferPsuWatts(name);
    if (watts === null) return false;
    return watts >= requiredPsuWatts(current.cpu.name, current.gpu.name);
  }
  if (key === 'gpu' && current.psu && current.cpu) {
    const watts = inferPsuWatts(current.psu.name);
    if (watts === null) return false;
    return watts >= requiredPsuWatts(current.cpu.name, name);
  }
  return true;
}

export function resolveLiveGuideSlots(
  guide: BudgetGuideDefinition,
  products: Product[],
): ResolvedGuideSlotTotals<Record<GuideSlotKey, ResolvedGuideComponent>> {
  const built = buildBudgetFromCatalog({ budget: guide.budget, products });
  const slots: Partial<Record<GuideSlotKey, ResolvedGuideComponent>> = { ...built.slots };
  let platform = inferPlatformFromSlots(slots, built.platform);

  for (const key of GUIDE_SLOT_KEYS) {
    if (slots[key]) continue;
    const spec = guide.components[key];
    const fallback = resolveGuideComponent(spec, products);
    const catalogSpend = Object.values(slots)
      .filter((slot) => slot?.priceSource === 'catalog')
      .reduce((sum, slot) => sum + (slot?.price ?? 0), 0);
    const fitsBudget = fallback.priceSource !== 'catalog' || catalogSpend + fallback.price <= guide.budget;
    const compatible = isNameCompatible(key, fallback.name, platform, slots);

    if (fitsBudget && compatible) {
      slots[key] = fallback;
      platform = inferPlatformFromSlots(slots, platform);
      continue;
    }

    slots[key] = toEstimatedGuideComponent({
      ...spec,
      name: genericSlotName(key, platform),
    });
  }

  return summarizeGuideComponents(slots as Record<GuideSlotKey, ResolvedGuideComponent>);
}

export function resolveCustomBudgetSlots(
  budget: number,
  products: Product[],
): ResolvedGuideSlotTotals<Record<GuideSlotKey, ResolvedGuideComponent>> {
  const built = buildBudgetFromCatalog({ budget, products });
  const slots = Object.fromEntries(
    GUIDE_SLOT_KEYS.map((key) => {
      const catalogSlot = built.slots[key];
      if (catalogSlot) return [key, catalogSlot];
      return [key, toEstimatedGuideComponent({
        name: genericSlotName(key, built.platform),
        description: 'Hoy no hay una oferta en stock compatible con este presupuesto.',
        estimatedPrice: 0,
      })];
    }),
  ) as Record<GuideSlotKey, ResolvedGuideComponent>;

  return summarizeGuideComponents(slots);
}
