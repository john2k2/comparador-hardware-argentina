export type GuideRamKit =
  | { state: 'none' | 'ambiguous' }
  | { state: 'value'; modules: number; moduleCapacityGb: number };

/** Los espacios no cambian el kit; dos composiciones distintas no lo acreditan. */
export function readGuideRamKit(text: string): GuideRamKit {
  const kits = new Map<string, { modules: number; moduleCapacityGb: number }>();
  for (const match of text.toLowerCase().matchAll(/\b([1-9]\d?)\s*x\s*([1-9]\d{0,2})\s*gb\b/g)) {
    const modules = Number(match[1]);
    const moduleCapacityGb = Number(match[2]);
    kits.set(`${modules}x${moduleCapacityGb}`, { modules, moduleCapacityGb });
  }
  if (kits.size === 0) return { state: 'none' };
  if (kits.size !== 1) return { state: 'ambiguous' };
  return { state: 'value', ...kits.values().next().value! };
}

/** Sólo unifica la escritura del kit para comparar títulos y slugs de la guía. */
export function normalizeGuideRamKitSpacing(text: string): string {
  return text.replace(/\b([1-9]\d?)\s*x\s*([1-9]\d{0,2})\s*gb\b/gi, '$1x$2gb');
}
