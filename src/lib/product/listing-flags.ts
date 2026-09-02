export type ListingFlags = {
  integratedGraphics: boolean | null;
  coolerIncluded: boolean | null;
};

export function parseListingFlags(name: string): ListingFlags {
  const normalized = name.toUpperCase().replace(/\s+/g, ' ').trim();

  let coolerIncluded: boolean | null = null;
  if (/\bC\s*\/\s*COOLER\b/.test(normalized) || /\bCON COOLER\b/.test(normalized)) {
    coolerIncluded = true;
  } else if (
    /\bS\s*\/\s*COOLER\b/.test(normalized)
    || /\bSIN COOLER\b/.test(normalized)
    || /\bWOF\b/.test(normalized)
  ) {
    coolerIncluded = false;
  }

  let integratedGraphics: boolean | null = null;
  if (/\bS\s*\/\s*VIDEO\b/.test(normalized) || /\bSIN VIDEO\b/.test(normalized)) {
    integratedGraphics = false;
  } else if (/\bC\s*\/\s*VIDEO\b/.test(normalized) || /\bCON VIDEO\b/.test(normalized)) {
    integratedGraphics = true;
  }

  return { integratedGraphics, coolerIncluded };
}
