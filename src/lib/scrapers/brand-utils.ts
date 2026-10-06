export const BRANDS = [
  'AMD',
  'Intel',
  'ASUS',
  'Gigabyte',
  'AORUS',
  'MSI',
  'Corsair',
  'NVIDIA',
  'GEFORCE',
  'RADEON',
] as const;

export type Brand = (typeof BRANDS)[number];

const BRAND_DISPLAY_NAMES: Record<string, string> = {
  AMD: 'AMD',
  INTEL: 'Intel',
  ASUS: 'ASUS',
  GIGABYTE: 'Gigabyte',
  AORUS: 'Gigabyte',
  MSI: 'MSI',
  CORSAIR: 'Corsair',
  NVIDIA: 'NVIDIA',
  GEFORCE: 'NVIDIA',
  RADEON: 'AMD Radeon',
};

export function isKnownBrand(word: string): boolean {
  const upper = word.toUpperCase();
  return BRANDS.some((brand) => upper.includes(brand.toUpperCase()));
}

export function extractBrandFromName(name: string): string | null {
  const upper = name.toUpperCase();

  for (const brand of BRANDS) {
    if (brand === 'AORUS' && (!/\bAORUS\b/.test(upper) || /\b(?:PARA|COMPATIBLE\s+CON)\s+(?:GIGABYTE\s+)?AORUS\b/.test(upper))) continue;
    if (upper.includes(brand.toUpperCase())) {
      return BRAND_DISPLAY_NAMES[brand] ?? brand;
    }
  }

  return null;
}

/** AORUS is a Gigabyte product line, not a separate manufacturer. */
export function resolveProductBrand(reportedBrand: string | null | undefined, name: string): string {
  const reported = reportedBrand?.trim() ?? '';
  if (reported && !/^(?:gen[eé]rica?|unknown|sin marca|n\/?a)$/i.test(reported)) return reported;
  // A compatibility mention does not identify the manufacturer of an accessory.
  if (/\b(?:para|compatible\s+con)\s+(?:gigabyte\s+)?aorus\b/i.test(name)) return reported || 'Generica';
  const extracted = extractBrandFromName(name);
  // GeForce/Radeon identify the chip family, not the board manufacturer.
  if ((extracted === 'NVIDIA' && !/\bNVIDIA\b/i.test(name)) || extracted === 'AMD Radeon') return reported || 'Generica';
  return extracted ?? (reported || 'Generica');
}
