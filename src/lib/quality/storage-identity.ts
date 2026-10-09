/** Contradicciones explícitas: una omisión conserva su estado desconocido. */
function onlyValue(values: string[]): string | undefined {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : undefined;
}

function storageAttributes(value: string) {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = text.replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
  const media: string[] = [];
  if (/\b(?:micro\s*sd(?:xc|hc)?|sd\s*(?:card|xc|hc)|tarjeta (?:de )?memoria)\b/.test(words)) media.push('card');
  if (/\b(?:pen\s*drive|pendrive|usb flash|memoria usb)\b/.test(words)) media.push('flash');
  if (/\b(?:hdd|disco (?:rigido|duro|mecanico))\b/.test(words)) media.push('hdd');
  if (/\b(?:ssd|nvme|disco solido)\b/.test(words)) media.push('ssd');
  const interfaces: string[] = [];
  if (/\b(?:nvme|pci\s*e|pcie)\b/.test(words)) interfaces.push('pcie');
  if (/\bsata(?:iii?|\s*[123])?\b/.test(words)) interfaces.push('sata');
  if (/\busb\b/.test(words)) interfaces.push('usb');
  const form = onlyValue([
    ...(/\bmicro\s*sd(?:xc|hc)?\b/.test(words) ? ['microsd'] : []),
    ...(/\b(?:sdxc|sdhc|sd card)\b/.test(words) ? ['sd'] : []),
    ...(/\bm[.\s]?2\b/.test(words) ? ['m2'] : []),
    ...(/\b2[.,\s]5\b/.test(words) ? ['2.5'] : []),
    ...(/\b3[.,\s]5\b/.test(words) ? ['3.5'] : []),
  ]);
  const location = /\b(?:extern[oa]|external|portable|portatil|pendrive|pen drive)\b/.test(words) ? 'external'
    : /\b(?:intern[oa]|internal)\b/.test(words) ? 'internal' : undefined;
  const brands = [...words.matchAll(/\b(western digital|wd|sandisk|kingston|adata|xpg|samsung|seagate|toshiba|kioxia|crucial|patriot|hiksemi|netac|lexar|pny|corsair|silicon power|transcend|teamgroup)\b/g)]
    .map(match => /^(?:wd|western digital)$/.test(match[1]) ? 'wd' : /^(?:adata|xpg)$/.test(match[1]) ? 'adata' : match[1]);
  const brand = onlyValue(brands);
  const models = [...words.matchAll(/\b(?:nv[123]|su\d{3}(?:ss)?|uv\d{3}|sn\d{3,4}[a-z]?|p\d{3}|n\d{3}[a-z]?|s\d{2,3}|mx\d{3}|bx\d{3}|v\d{3}[a-z]?|kc\d{3,4}|a\d{3,4}|elements|my passport|my book|sandisk plus|wave|canvas(?: select)?(?: plus)?|(?:mars|legend)\s*\d{3}(?:\s*plus)?)\b/g)]
    .map(match => match[0].replace(/\s+/g, '').replace(/^(su\d{3})ss$/, '$1'));
  if (brand === 'wd' && models.length === 0) models.push(...words.match(/\b(?:green|blue|black|purple|red|gold)\b/g) ?? []);
  if (brand === 'samsung') models.push(...[...words.matchAll(/\b\d{3,4}\s*(?:evo|qvo|pro)(?:\s*plus)?\b/g)]
    .map(match => match[0].replace(/\s+/g, '')));
  const model = onlyValue(models);
  const capacities = [...words.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(tb|gb)\b(?!\s*(?:\/|ps\b))/g)]
    .map(match => String(Number(match[1].replace(',', '.')) * (match[2] === 'tb' ? 1000 : 1)));
  return { media: onlyValue(media), interface: onlyValue(interfaces), form, location,
    brand, model, capacity: onlyValue(capacities) };
}

export function hasExplicitStorageConflict(name: string, source: string): boolean {
  const target = storageAttributes(name), offer = storageAttributes(source);
  return (Object.keys(target) as Array<keyof typeof target>)
    .some(key => target[key] !== undefined && offer[key] !== undefined && target[key] !== offer[key]);
}
