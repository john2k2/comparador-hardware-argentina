export const BRANDS = [
  'AMD',
  'Intel',
  'ASUS',
  'Gigabyte',
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
  MSI: 'MSI',
  CORSAIR: 'Corsair',
  NVIDIA: 'NVIDIA',
  GEFORCE: 'NVIDIA',
  RADEON: 'AMD Radeon',
};

export function isKnownBrand(word: string): boolean {
  const upper = word.toUpperCase();
  return BRANDS.some((brand) => upper.includes(brand));
}

export function extractBrandFromName(name: string): string | null {
  const upper = name.toUpperCase();

  for (const brand of BRANDS) {
    if (upper.includes(brand)) {
      return BRAND_DISPLAY_NAMES[brand] ?? brand;
    }
  }

  return null;
}
