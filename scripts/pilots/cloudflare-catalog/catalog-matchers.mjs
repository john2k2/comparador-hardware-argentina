// Port local de los helpers de catálogo SQL. No determina stock ni elegibilidad
// de ofertas: esas decisiones se exportan desde PostgreSQL junto al snapshot.
// Fuente: migrations/20260930130000 + 20261010194500 + 20261010222700.
const SERIES = new Set(['aorus', 'strix', 'tuf', 'dual', 'prime', 'proart', 'eagle', 'windforce', 'gaming', 'ventus', 'shadow', 'suprim', 'trinity', 'phoenix', 'pulse', 'nitro', 'challenger', 'hellhound', 'tomahawk', 'mortar', 'ds3h', 'hero', 'lightspeed']);
const PORTABLE = /\b(sodimm|so\s*dimm|notebook|laptop)\b/;
const RAM_TERMS = /\b(ddr[45]|ram|memoria|sodimm|dimm)\b/;
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
  return searchIdentityText(identityText(value));
}
function searchIdentityText(value) {
  return value
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

// Contexto separado: prepareQuery conserva su contrato SQL/JSON. Nunca mutar
// sus words al normalizar RAM, porque todas las fichas comparten la consulta.
export function prepareMatcherQuery({ normalized, words, queryChip, kind }) {
  if (normalized === '') return { empty: true };
  const normalizeRam = kind === 'ram' && RAM_SIGNATURE.test(normalized);
  if (normalizeRam) {
    normalized = ramSearchText(normalized);
    words = significantWords(normalized);
  }
  const modelWords = words.filter(word => /^\d{3,5}$/.test(word) || (/[a-z]/.test(word) && /[0-9]/.test(word)));
  const suffixes = modelWords.length ? normalized.split(' ').filter(token => ['x', 'g', 'f', 'k'].includes(token)) : [];
  return {
    empty: normalized === '', normalizeRam, kind, queryChip,
    chipFamily: queryChip?.[0]?.replace(/[3579]$/, ''),
    tokens: words.map(word => ({ bounded: ` ${word} `, requiredName: SERIES.has(word)
      || (kind === 'ram' && /^([0-9]+(gb|mhz)|[1-8]x[0-9]+gb)$/.test(word)) })),
    requiredMatches: words.length <= 2 ? words.length : Math.ceil(words.length * 0.7),
    suffixGroups: suffixes.map(token => modelWords.map(word => ({ joined: word + token, spaced: ` ${word} ${token} ` }))),
    portableQuery: PORTABLE.test(normalized), ramTerms: RAM_TERMS.test(normalized),
  };
}

export function matchesPrepared({ title, name, document, normalized, words, queryChip, kind, urls = '', portableHint = false }, context) {
  const query = context ?? prepareMatcherQuery({ normalized, words, queryChip, kind });
  if (query.empty) return true;
  if (query.normalizeRam) {
    name = ramSearchText(name);
    document = ramSearchText(document);
  }
  const nameWords = ` ${name} `, documentWords = ` ${document} `;
  let matched = 0;
  for (const token of query.tokens) {
    if (!documentWords.includes(token.bounded)) return false;
    const inName = nameWords.includes(token.bounded);
    if (token.requiredName && !inName) return false;
    if (inName) matched++;
  }
  if (matched < query.requiredMatches) return false;
  for (const group of query.suffixGroups) {
    if (!group.some(model => name.includes(model.joined) || nameWords.includes(model.spaced))) return false;
  }
  // Las URLs sólo participan después de los rechazos por palabras y variantes.
  // El contexto lazy comparte su texto normalizado entre ambas señales.
  const urlHints = portableHint !== null && typeof portableHint === 'object' ? portableHint : null;
  if (!query.portableQuery
    && (PORTABLE.test(name) || (urlHints ? urlHints.portable : portableHint))
    && (query.ramTerms || RAM_TERMS.test(name)
      || RAM_TERMS.test(urlHints ? urlHints.search : searchText(urls)))) return false;
  if (query.queryChip != null) {
    const productChip = catalogChip(title, query.kind);
    if (!productChip || query.queryChip[1] !== productChip[1]) return false;
    if (query.queryChip[0] !== 'unknown' && productChip[0] !== 'unknown'
      && query.chipFamily !== productChip[0].replace(/[3579]$/, '')) return false;
    if (query.queryChip[2] !== '' && query.queryChip[2] !== productChip[2]) return false;
  }
  return true;
}

export function matchesProduct(product, prepared, urls = '', portableHint = false, context) {
  const title = product.name;
  const name = product.catalog_name ?? searchText(title);
  const document = product.catalog_document ?? searchText(`${title} ${product.brand ?? ''} ${product.model ?? ''} ${product.normalized_title ?? ''} ${product.family_key ?? ''} ${product.variant_key ?? ''} ${product.canonical_product_key ?? ''}`);
  if (prepared.candidate != null && !document.includes(prepared.candidate)) return false;
  if (prepared.kind !== 'ram' && prepared.words.length <= 2 && prepared.words.some(word => !containsWord(name, word))) return false;
  return matchesPrepared({ title, name, document, ...prepared, urls, portableHint }, context);
}

export function matchesQuery(title, document, query, urls = '') {
  const normalized = searchText(query);
  let kind = 'gpu';
  let queryChip = catalogChip(query, kind);
  if (!queryChip) { kind = 'cpu'; queryChip = catalogChip(query, kind); }
  if (queryChip == null && RAM.test(normalized)) kind = 'ram';
  return matchesPrepared({ title, name: searchText(title), document, normalized, words: significantWords(normalized), queryChip, kind, urls, portableHint: prepareUrlHints(urls) });
}

export function hasPortableHint(urls) {
  const value = String(urls ?? '');
  return asciiPortableHint(value) ?? PORTABLE.test(identityText(value));
}
function asciiPortableHint(value) {
  // ASCII no cambia con NFD. identityText convierte puntuación en espacios,
  // excepto '+': conservar esas fronteras y el caso especial so\s*dimm.
  if (/^[\x00-\x7f]*$/.test(value)) return /(?:^|[^a-z0-9])(?:sodimm|so[^a-z0-9+]*dimm|notebook|laptop)(?=$|[^a-z0-9])/i.test(value);
  return undefined;
}
// Getters compartidos en el prototipo: no crear closures por cada candidato.
class UrlHints {
  #value;
  #normalized;
  #portable;
  #search;
  constructor(urls) { this.#value = String(urls ?? ''); }
  #identity() { return this.#normalized ??= identityText(this.#value); }
  get portable() { return this.#portable ??= asciiPortableHint(this.#value) ?? PORTABLE.test(this.#identity()); }
  get search() { return this.#search ??= searchIdentityText(this.#identity()); }
}
export function prepareUrlHints(urls) { return new UrlHints(urls); }

// Los alias permiten contrastar directamente una matriz extraída de PostgreSQL.
export { identityText as catalogIdentityText, searchText as catalogSearchText, ramSearchText as catalogRamSearchText };
