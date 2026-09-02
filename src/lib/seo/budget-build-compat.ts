import {
  compactGpuChip,
  normalizeIdentityText,
  parseCpuModelSignature,
  parseGpuChipSignature,
} from '@/lib/product-identity';

export type PcSocket = 'am4' | 'am5' | 'lga1700';
export type RamGen = 'ddr4' | 'ddr5';
export type RamForm = 'sodimm' | 'dimm' | 'unk';
export type PlatformId = `${PcSocket}-${RamGen}`;

export type MotherboardPlatform = {
  socket: PcSocket;
  ramGen: RamGen;
};

export type RamProfile = {
  gen: RamGen;
  capacityGb: number | null;
  form: RamForm;
};

const INVALID_MB_CHIPSETS = new Set(['b580', 'a380', 'a750', 'a770']);

const AM4_CHIPSETS = new Set(['a320', 'b350', 'x370', 'b450', 'x470', 'a520', 'b550', 'x570']);
const AM5_CHIPSETS = new Set([
  'a620', 'b650', 'b650e', 'x670', 'x670e', 'b840', 'b850', 'x870', 'x870e',
]);
const LGA1700_CHIPSETS = new Set(['h610', 'b660', 'h670', 'z690', 'b760', 'h770', 'z790']);

const GPU_TIER: Record<string, number> = {
  gtx1650: 10,
  gtx1660: 12,
  rtx3050: 18,
  rtx3060: 28,
  arcb580: 30,
  rx6600: 32,
  rtx5050: 34,
  rx7600: 36,
  rtx4060: 38,
  rx9060: 42,
  rtx4060ti: 44,
  rx6700xt: 46,
  rx9060xt: 48,
  rx7700xt: 50,
  rtx4070: 52,
  rtx5060: 53,
  rx9070: 56,
  rx7800xt: 58,
  rtx4070ti: 60,
  rtx5070: 62,
  rtx4070tisuper: 64,
  rx9070xt: 66,
  rtx4080: 72,
  rx7900xt: 74,
  rtx4080super: 76,
  rtx5080: 80,
  rtx4090: 90,
  rtx5090: 100,
};

const GPU_TGP_WATTS: Record<string, number> = {
  gtx1650: 75,
  gtx1660: 120,
  rtx3050: 130,
  rtx3060: 170,
  arcb580: 190,
  rx6600: 132,
  rtx5050: 130,
  rx7600: 165,
  rtx4060: 115,
  rx9060: 150,
  rtx4060ti: 160,
  rx9060xt: 160,
  rx6700xt: 230,
  rx7700xt: 245,
  rtx4070: 200,
  rx9070: 220,
  rx7800xt: 263,
  rtx4070ti: 285,
  rtx5070: 250,
  rx9070xt: 304,
  rtx4080: 320,
  rx7900xt: 315,
  rtx5080: 360,
  rtx4090: 450,
  rtx5090: 575,
};

function normalizeChipsetToken(raw: string): string {
  if (AM4_CHIPSETS.has(raw) || AM5_CHIPSETS.has(raw) || LGA1700_CHIPSETS.has(raw)) return raw;
  if (raw.endsWith('m') && raw.length === 5) {
    const base = raw.slice(0, 4);
    if (AM4_CHIPSETS.has(base) || AM5_CHIPSETS.has(base) || LGA1700_CHIPSETS.has(base)) return base;
  }
  return raw;
}

function firstChipset(normalized: string): string | null {
  const match = normalized.match(/\b([abhxz]\d{3}[a-z]{0,2})\b/);
  return match?.[1] ? normalizeChipsetToken(match[1]) : null;
}

function socketFromText(normalized: string): PcSocket | null {
  if (/\bam5\b/.test(normalized)) return 'am5';
  if (/\bam4\b/.test(normalized)) return 'am4';
  if (/\blga\s*1700\b/.test(normalized)) return 'lga1700';
  return null;
}

function ramGenFromText(normalized: string): RamGen | null {
  if (/\bddr5\b/.test(normalized)) return 'ddr5';
  if (/\bddr4\b/.test(normalized)) return 'ddr4';
  return null;
}

function defaultRamGen(socket: PcSocket, chipset: string | null): RamGen | null {
  if (socket === 'am4') return 'ddr4';
  if (socket === 'am5') return 'ddr5';
  if (!chipset) return null;
  if (chipset === 'h610' || chipset === 'b660') return 'ddr4';
  if (chipset === 'z690' || chipset === 'z790' || chipset === 'b760' || chipset === 'h770') return 'ddr5';
  return null;
}

export function inferCpuSocket(name: string): PcSocket | null {
  const normalized = normalizeIdentityText(name);
  if (!normalized) return null;
  if (/\b(threadripper|epyc|xeon|celeron|pentium|ultra)\b/.test(normalized)) return null;

  const named = socketFromText(normalized);
  if (named) return named;

  const cpu = parseCpuModelSignature(name);
  if (!cpu || cpu.family === 'unknown') return null;

  if (cpu.family.startsWith('ryzen')) {
    if (cpu.number.length < 4) return null;
    const gen = Number(cpu.number[0]);
    if (gen <= 5) return 'am4';
    if (gen >= 7) return 'am5';
    return null;
  }

  if (cpu.family.startsWith('corei') && cpu.number.length >= 5) {
    const gen = Number(cpu.number.slice(0, 2));
    if (gen >= 12 && gen <= 14) return 'lga1700';
  }

  return null;
}

export function inferMotherboardPlatform(name: string): MotherboardPlatform | null {
  const normalized = normalizeIdentityText(name);
  if (!normalized) return null;
  if (/\b(gabinete|tower|chassis|fuente|memoria ram|procesador|placa de video)\b/.test(normalized)) {
    return null;
  }

  const chipset = firstChipset(normalized);
  if (chipset && INVALID_MB_CHIPSETS.has(chipset)) return null;
  if (!chipset) return null;

  let socket = socketFromText(normalized);
  if (!socket) {
    if (AM4_CHIPSETS.has(chipset)) socket = 'am4';
    else if (AM5_CHIPSETS.has(chipset)) socket = 'am5';
    else if (LGA1700_CHIPSETS.has(chipset)) socket = 'lga1700';
  }
  if (!socket) return null;

  const ramGen = ramGenFromText(normalized) ?? defaultRamGen(socket, chipset);
  if (!ramGen) return null;

  return { socket, ramGen };
}

export function inferRamProfile(name: string): RamProfile | null {
  const normalized = normalizeIdentityText(name);
  if (!normalized) return null;

  const gen = ramGenFromText(normalized);
  if (!gen) return null;

  let form: RamForm = 'unk';
  if (/\b(sodimm|so\s*dimm|notebook|laptop)\b/.test(normalized)) form = 'sodimm';
  else if (/\b(udimm|dimm|desktop)\b/.test(normalized)) form = 'dimm';

  const kit = normalized.match(/\b(\d)\s*x\s*(\d{1,2})\s*gb\b/);
  let capacityGb: number | null = kit
    ? Number(kit[1]) * Number(kit[2])
    : null;
  if (capacityGb === null) {
    const total = normalized.match(/\b(8|16|24|32|48|64|96|128)\s*gb\b/);
    capacityGb = total ? Number(total[1]) : null;
  }

  return { gen, capacityGb, form };
}

export function isDesktopRam(profile: RamProfile): boolean {
  return profile.form !== 'sodimm';
}

export function inferPsuWatts(name: string): number | null {
  const normalized = normalizeIdentityText(name);
  const matches = [...normalized.matchAll(/\b(\d{3,4})\s*w(?:att)?s?\b/g)]
    .map((match) => Number(match[1]))
    .filter((watts) => watts >= 400 && watts <= 2000);
  if (matches.length === 0) return null;
  return Math.max(...matches);
}

export function inferSsdCapacityGb(name: string): number | null {
  const normalized = normalizeIdentityText(name);
  if (/\b(2230|2242)\b/.test(normalized)) return null;
  if (/\bhdd\b/.test(normalized) && !/\b(ssd|nvme)\b/.test(normalized)) return null;

  const tb = normalized.match(/\b(\d+(?:\.\d+)?)\s*tb\b/);
  if (tb) return Math.round(Number(tb[1]) * 1024);

  const gb = normalized.match(/\b(\d{3,4})\s*gb\b/);
  if (gb) return Number(gb[1]);

  return null;
}

export function isLikelyDesktopCase(name: string): boolean {
  const normalized = ` ${normalizeIdentityText(name)} `;
  if (/\b(fan|ventilador|cooler gabinete|bulk)\b/.test(normalized) && !/\b(mid tower|full tower|gabinete)\b/.test(normalized)) {
    return false;
  }
  return /\b(gabinete|tower|chassis)\b/.test(normalized);
}

export function compactGpuFromName(name: string): string | null {
  const chip = parseGpuChipSignature(name);
  return chip ? compactGpuChip(chip) : null;
}

export function gpuPerformanceTier(name: string): number {
  const chip = compactGpuFromName(name);
  if (!chip) return 0;
  return GPU_TIER[chip] ?? 1;
}

export function estimatedGpuTgpWatts(name: string): number {
  const chip = compactGpuFromName(name);
  if (chip && GPU_TGP_WATTS[chip] !== undefined) return GPU_TGP_WATTS[chip];
  return 200;
}

export function estimatedCpuTdpWatts(name: string): number {
  const cpu = parseCpuModelSignature(name);
  if (!cpu) return 105;
  if (cpu.suffixes.includes('x3d')) return 120;
  if (cpu.family.startsWith('corei') && cpu.suffixes.includes('k')) return 125;
  if (cpu.number.length >= 4) {
    const classDigit = Number(cpu.number[1]);
    if (classDigit >= 9) return 170;
    if (classDigit >= 7) return 105;
  }
  if (cpu.suffixes.includes('x')) return 105;
  return 65;
}

export function requiredPsuWatts(cpuName: string, gpuName: string): number {
  const raw = (estimatedCpuTdpWatts(cpuName) + estimatedGpuTgpWatts(gpuName) + 150) * 1.2;
  return Math.max(450, Math.ceil(raw / 50) * 50);
}

export function platformId(socket: PcSocket, ramGen: RamGen): PlatformId {
  return `${socket}-${ramGen}`;
}

export function isCurrentGamingGpu(name: string): boolean {
  const chip = compactGpuFromName(name);
  if (!chip) return false;
  if (chip.startsWith('gtx')) return false;
  if (chip.startsWith('rtx')) {
    const model = Number(chip.replace(/\D/g, ''));
    return model >= 3050;
  }
  if (chip.startsWith('rx')) {
    const model = Number(chip.replace(/^rx/, '').replace(/xtx|xt|gre/g, ''));
    return model >= 6600;
  }
  if (chip.startsWith('arc')) {
    return /a750|a770|b570|b580/.test(chip);
  }
  return false;
}

export function cpuGamingTier(name: string): number {
  const cpu = parseCpuModelSignature(name);
  if (!cpu) return 0;
  if (cpu.suffixes.includes('x3d')) return 90;
  const family = cpu.family;
  if (family === 'ryzen9' || family === 'corei9') return 85;
  if (family === 'ryzen7' || family === 'corei7') return 75;
  if (family === 'ryzen5' || family === 'corei5') return 60;
  if (family === 'ryzen3' || family === 'corei3') return 35;
  if (family.startsWith('ryzen') && cpu.number.length >= 4) {
    const classDigit = Number(cpu.number[1]);
    if (classDigit >= 9) return 85;
    if (classDigit >= 7) return 75;
    if (classDigit >= 5) return 60;
    return 35;
  }
  return 40;
}

export function isCurrentGamingCpu(name: string): boolean {
  const cpu = parseCpuModelSignature(name);
  if (!cpu || cpuGamingTier(name) < 60) return false;
  if (cpu.family.startsWith('ryzen')) {
    return cpu.number.length >= 4 && Number(cpu.number[0]) >= 5;
  }
  if (cpu.family.startsWith('corei')) {
    return cpu.number.length >= 5 && Number(cpu.number.slice(0, 2)) >= 12;
  }
  return false;
}

export function cpuTier(name: string): number {
  const cpu = parseCpuModelSignature(name);
  if (!cpu) return 0;
  const number = Number(cpu.number);
  const bonus = cpu.suffixes.includes('x3d') ? 500 : cpu.suffixes.includes('x') ? 20 : 0;
  return number + bonus;
}
