import { normalizeIdentityText } from '@/lib/product-identity';

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

/** Prueba deliberadamente acotada: el detector de conflictos no demuestra equivalencia. */
export function exactSsdAttributes(name: string): Record<string, string> | null {
  const text = normalizeIdentityText(name);
  // x4 describe carriles sólo si está ligado explícitamente a PCIe o Gen; x2 suelto puede ser cantidad.
  const withoutLanes = name.replace(/\b(?:pcie|pci[ -]?e)\s*(?:[345](?:[.,]0)?\s*)?[x×]\s*(?:16|8|4|2|1)\b|\bgen\s*[345]\s*[x×]\s*(?:16|8|4|2|1)\b/gi, ' ');
  if (/\b(?:combo|bundle|kit|pack|lote|unidades?|doble|dual|dos|adaptador|adapter|carcasa|enclosure|gabinete|caddy|dock|docking|convertidor|lector|cable|para|extern[oa]|external|portable|portatil|usb|hdd|pendrive)\b/.test(text)
      || /\b\d+\s*[x×]\s*\d+\s*(?:gb|tb)\b|\b\d+(?:[.,]\d+)?\s*(?:gb|tb)\s*[x×]\s*\d+\b|\b\d+\s*(?:[x×]\s*)?(?:ssd|discos?)\b/i.test(name)
      || /(?:^|[^a-z])[x×]\s*\d+\b/i.test(withoutLanes)
      || /\+/.test(name)) return null;
  // GB/s y GBps describen transferencia: no son capacidades ni formas de unidad.
  const withoutSpeeds = name.replace(/\b\d+(?:[.,]\d+)?\s*(?:tb|gb|mb|kb)\s*(?:\/\s*s\b|ps\b|por\s+segundo\b)/gi, ' ');
  const generations = [...text.matchAll(/\b(?:gen(?:eracion)?\s*|pcie\s+)([345])\b/g)].map(match => match[1]);
  const conditions = text.match(/\b(?:outlet|usado|used|reacondicionado|refurbished)\b/g) ?? [];
  const withHeatsink = /\bcon (?:disipador|heatsink)\b/.test(text);
  const withoutHeatsink = /\bsin (?:disipador|heatsink)\b/.test(text);
  if (new Set(generations).size > 1 || new Set(conditions).size > 1 || (withHeatsink && withoutHeatsink)
      || /\b(?:gen(?:eracion)?\s*|pcie\s*)[345](?:[.,]0)?\s*[\/|]\s*[345]\b/i.test(withoutSpeeds)) return null;
  const attrs = storageAttributes(withoutSpeeds);
  if (attrs.media !== 'ssd' || !attrs.brand || !attrs.model || !attrs.capacity
      || !Number.isFinite(Number(attrs.capacity)) || Number(attrs.capacity) <= 0 || !attrs.interface || !attrs.form
      || !['sata', 'pcie'].includes(attrs.interface) || !['m2', '2.5'].includes(attrs.form)
      || (attrs.interface === 'pcie' && attrs.form !== 'm2')) return null;
  // El título completo conserva Plus, generación, disipador, condición y sufijos no modelados.
  return { media: attrs.media, brand: attrs.brand, model: attrs.model, capacity: attrs.capacity,
    interface: attrs.interface, form: attrs.form, title: text };
}
