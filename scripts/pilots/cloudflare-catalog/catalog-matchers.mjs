// Port local de los helpers de catálogo SQL. No determina stock ni elegibilidad
// de ofertas: esas decisiones se exportan desde PostgreSQL junto al snapshot.
// Fuente: migrations/20260930130000 + 20261010194500 + 20261010222700.
const SERIES = new Set(['aorus', 'strix', 'tuf', 'dual', 'prime', 'proart', 'eagle', 'windforce', 'gaming', 'ventus', 'shadow', 'suprim', 'trinity', 'phoenix', 'pulse', 'nitro', 'challenger', 'hellhound', 'tomahawk', 'mortar', 'ds3h', 'hero', 'lightspeed']);
const PORTABLE = /\b(sodimm|so\s*dimm|notebook|laptop)\b/;
const RAM = /\b(ddr[345]|ram|memoria)\b/;
const RAM_SIGNATURE = /\b([0-9]{1,3}\s*gb|[1-9][0-9]{3,4}(\s*mhz)?|[1-8]\s*x\s*[0-9]{1,3}(gb)?)\b/;
const collator = new Intl.Collator('en-US');
const containsWord = (text, word) => (` ${text} `).includes(` ${word} `);
const significantWords = normalized => normalized.split(' ').filter(word => word.length > 1);

export function identityText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function searchText(value) {
  return identityText(value)
    .replace(/\b(placas?\s+de\s+video|tarjetas?\s+graficas?|gpu)\b/g, 'gpu')
    .replace(/\b(procesadores?|microprocesadores?|micro|cpu)\b/g, 'cpu')
    .replace(/\b(memoria\s+ram|ram)\b/g, 'ram')
    .replace(/\b(disco\s+solido|solid\s+state|ssd)\b/g, 'ssd')
    .replace(/\b(fuentes?\s+de\s+alimentacion|psu)\b/g, 'psu')
    .replace(/\b(placas?\s+madre|motherboards?|mother)\b/g, 'motherboard');
}

export function ramSearchText(value) {
  return searchText(value)
    .replace(/\b([0-9]{1,3})\s*gb\b/g, '$1gb')
    .replace(/\b([1-9][0-9]{3,4})\s*mhz\b/g, '$1mhz')
    .replace(/\b([1-8])\s*x\s*([0-9]{1,3})(\s*gb)?\b/g, '$1x$2gb')
    .replace(/\b([1-9][0-9]{3,4})\b/g, '$1mhz');
}

export function catalogChip(value, kind) {
  const title = identityText(value);
  let part;
  if (kind === 'gpu') {
    part = title.match(/\b(?:geforce\s+)?(rtx|gtx)\s*(\d{3,4})(?:\s*(ti))?(?:\s*(super)|\s+s(?=\s|$))?\b/);
    if (part) return [part[1], part[2], `${part[3] ?? ''} ${part[4] === 'super' || (part[3] === 'ti' && /\b(rtx|gtx)\s*\d{3,4}\s*ti\s+s(\s|$)/.test(title)) ? 'super' : ''}`.trim()];
    part = title.match(/\b(?:radeon\s+)?rx\s*(\d{3,4})(?:\s*(xtx|xt))?\b/);
    if (part) return ['rx', part[1], part[2] ?? ''];
    part = title.match(/\barc\s*([a-z]?\d{3})\b/);
    if (part) return ['arc', part[1], ''];
  } else {
    part = title.match(/\bryzen\s*(?:([3579])\s+)?(\d{3,5})(x3d|gt|ge|xt|x|g|f|t)?\b/);
    if (part) return [`ryzen${part[1] ?? ''}`, part[2], part[3] ?? ''];
    part = title.match(/\bcore\s*i([3579])\s*(\d{4,5})([a-z]{0,2})\b/);
    if (part) return [`corei${part[1]}`, part[2], part[3] ?? ''];
    part = title.match(/\b(\d{3,5})(x3d|gt|ge|xt|x|g|f|t)\b/);
    if (part) return ['unknown', part[1], part[2]];
    if (/\b(ryzen|core|procesador|micro)\b/.test(title) || /^\d{3,5}$/.test(title)) {
      part = title.match(/\b(\d{3,5})\b/);
      if (part) return ['unknown', part[1], ''];
    }
  }
  return null;
}

// Éste prepara search_catalog_page; catalog_matches_query no usa los mismos
// ajustes de categoría y número ambiguo. Se conserva esa diferencia explícita.
export function prepareQuery(query = '', category = null) {
  let normalized = searchText(query);
  let kind = 'gpu';
  let queryChip = catalogChip(query, kind);
  if (!queryChip) { kind = 'cpu'; queryChip = catalogChip(query, kind); }
  const ramQuery = category === 'memoria-ram' || (category == null && queryChip == null && RAM.test(normalized));
  if (ramQuery) normalized = ramSearchText(normalized);
  const words = significantWords(normalized);
  const stableWords = normalized.split(' ').map(token => {
    if (!ramQuery) return token;
    if (/^[0-9]+(gb|mhz)$/.test(token)) return token.replace(/(gb|mhz)$/, '');
    if (/^[1-8]x[0-9]+gb$/.test(token)) return token.match(/x([0-9]+)/)[1];
    return token;
  }).filter(word => word.length > 1);
  const candidate = stableWords.sort((a, b) => Number(/[0-9]/.test(b)) - Number(/[0-9]/.test(a)) || b.length - a.length || collator.compare(a, b))[0] ?? null;
  if (ramQuery) { kind = 'ram'; queryChip = null; }
  if (/^[0-9]{3,5}$/.test(normalized) && category !== 'procesadores') queryChip = null;
  return { normalized, words, queryChip, kind, candidate, ramQuery };
}

export function matchesPrepared({ title, name, document, normalized, words, queryChip, kind, urls = '', portableHint = false }) {
  if (normalized === '') return true;
  if (kind === 'ram' && RAM_SIGNATURE.test(normalized)) {
    normalized = ramSearchText(normalized);
    name = ramSearchText(name);
    document = ramSearchText(document);
    words = significantWords(normalized);
  }
  let matched = 0;
  for (const token of words) {
    if (!containsWord(document, token)) return false;
    const inName = containsWord(name, token);
    if (kind === 'ram' && /^([0-9]+(gb|mhz)|[1-8]x[0-9]+gb)$/.test(token) && !inName) return false;
    if (inName) matched++;
    if (SERIES.has(token) && !inName) return false;
  }
  if (matched < (words.length <= 2 ? words.length : Math.ceil(words.length * 0.7))) return false;
  const modelWords = words.filter(word => /^\d{3,5}$/.test(word) || (/[a-z]/.test(word) && /[0-9]/.test(word)));
  for (const token of normalized.split(' ')) {
    if (['x', 'g', 'f', 'k'].includes(token) && modelWords.length > 0
      && !modelWords.some(word => name.includes(word + token) || (` ${name} `).includes(` ${word} ${token} `))) return false;
  }
  if ((PORTABLE.test(name) || portableHint) && !PORTABLE.test(normalized)
    && /\b(ddr[45]|ram|memoria|sodimm|dimm)\b/.test(`${normalized} ${name} ${searchText(urls)}`)) return false;
  if (queryChip != null) {
    const productChip = catalogChip(title, kind);
    if (!productChip || queryChip[1] !== productChip[1]) return false;
    if (queryChip[0] !== 'unknown' && productChip[0] !== 'unknown'
      && queryChip[0].replace(/[3579]$/, '') !== productChip[0].replace(/[3579]$/, '')) return false;
    if (queryChip[2] !== '' && queryChip[2] !== productChip[2]) return false;
  }
  return true;
}

export function matchesProduct(product, prepared, urls = '', portableHint = false) {
  const title = product.name;
  const name = product.catalog_name ?? searchText(title);
  const document = product.catalog_document ?? searchText(`${title} ${product.brand ?? ''} ${product.model ?? ''} ${product.normalized_title ?? ''} ${product.family_key ?? ''} ${product.variant_key ?? ''} ${product.canonical_product_key ?? ''}`);
  if (prepared.candidate != null && !document.includes(prepared.candidate)) return false;
  if (prepared.kind !== 'ram' && prepared.words.length <= 2 && prepared.words.some(word => !containsWord(name, word))) return false;
  return matchesPrepared({ title, name, document, ...prepared, urls, portableHint });
}

export function matchesQuery(title, document, query, urls = '') {
  const normalized = searchText(query);
  let kind = 'gpu';
  let queryChip = catalogChip(query, kind);
  if (!queryChip) { kind = 'cpu'; queryChip = catalogChip(query, kind); }
  if (queryChip == null && RAM.test(normalized)) kind = 'ram';
  return matchesPrepared({ title, name: searchText(title), document, normalized, words: significantWords(normalized), queryChip, kind, urls, portableHint: PORTABLE.test(identityText(urls)) });
}

export function hasPortableHint(urls) { return PORTABLE.test(identityText(urls)); }

// Los alias permiten contrastar directamente una matriz extraída de PostgreSQL.
export { identityText as catalogIdentityText, searchText as catalogSearchText, ramSearchText as catalogRamSearchText };
