import { normalizeIdentityText } from '@/lib/product-identity';

function onlyValue(values: string[]): string | undefined {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

/** Detecta contradicciones literales; ni los watts ni el sello prueban equivalencia. */
function powerSupplyAttributes(value: string) {
  const text = normalizeIdentityText(value);
  const brands = [...text.matchAll(/\b(arkham|adata|xpg|raidmax|gamemax|lnz|xyz|corsair|cooler master|seasonic|thermaltake|evga|gigabyte|msi|asus|be quiet|redragon|sentey|aerocool|deepcool|silverstone|nzxt|antec|fsp|lian li|cougar)\b/g)]
    .map(match => /^(arkham|adata|xpg)$/.test(match[1]) ? 'xpg' : match[1]);
  const watts = [...text.matchAll(/\b(\d{3,4})\s*(?:w|watts?)\b/g)].map(match => match[1]);
  const series = text.match(/\b(?:coreshield|kyber|core reactor|pylon|phantom|xtb|gp|gx|zx|rmx|rme|cv|cx|mag|toughpower|smart)\b/g) ?? [];
  const certification = [...text.matchAll(/\b80\s*(?:plus|\+)\s*(bronze|silver|gold|platinum|titanium|white)\b/g)].map(match => match[1]);
  const packaging = text.match(/\b(?:oem|retail)\b/g) ?? [];
  return { brand: onlyValue(brands), watts: onlyValue(watts), series: onlyValue(series),
    certification: onlyValue(certification), packaging: onlyValue(packaging) };
}

export function hasExplicitPowerSupplyConflict(name: string, source: string): boolean {
  const target = powerSupplyAttributes(name), offer = powerSupplyAttributes(source);
  return (Object.keys(target) as Array<keyof typeof target>)
    .some(key => target[key] !== undefined && offer[key] !== undefined && target[key] !== offer[key]);
}
