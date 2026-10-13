import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const roles = ['producer', 'snapshot', 'public-api'];
const stocks = ['in-stock', 'low-stock', 'out-of-stock', 'backorder', 'unknown'];
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function timestamp(value, name) {
  if (typeof value !== 'string' || !iso.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`OFFER_EVIDENCE_${name}`);
  }
  const parts = value.slice(0, 19).match(/\d+/g).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(parts[3], parts[4], parts[5], 0);
  if ([date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].some((part, index) => part !== parts[index])) {
    throw new Error(`OFFER_EVIDENCE_${name}`);
  }
  return Date.parse(value);
}

function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1500) {
    throw new Error(`OFFER_EVIDENCE_${name}`);
  }
  return value;
}

function destination(value) {
  text(value, 'URL');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port) {
    throw new Error('OFFER_EVIDENCE_URL');
  }
  return value;
}

/** Conciliación offline de una terna exacta; nunca decide identidad o compra. */
export function reconcileOfferEvidence(input) {
  if (input?.version !== 1 || !Array.isArray(input.evidence) || input.evidence.length !== 3) {
    throw new Error('OFFER_EVIDENCE_INPUT');
  }
  const asOf = timestamp(input.asOf, 'AS_OF');
  const subject = { productId: text(input.subject?.productId, 'PRODUCT'),
    storeId: text(input.subject?.storeId, 'STORE'), url: destination(input.subject?.url) };
  const seen = new Set();
  const evidence = input.evidence.map(item => {
    if (!roles.includes(item?.role) || seen.has(item.role)) throw new Error('OFFER_EVIDENCE_ROLE');
    seen.add(item.role);
    text(item.productId, 'PRODUCT');
    text(item.storeId, 'STORE');
    destination(item.url);
    if (item.currency !== 'ARS') throw new Error('OFFER_EVIDENCE_CURRENCY');
    if (item.price !== null && (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0)) {
      throw new Error('OFFER_EVIDENCE_PRICE');
    }
    if (item.stock !== null && !stocks.includes(item.stock)) throw new Error('OFFER_EVIDENCE_STOCK');
    if (item.priceCondition !== null) text(item.priceCondition, 'CONDITION');
    const captured = timestamp(item.capturedAt, 'CAPTURED_AT');
    const observed = item.lastUpdated === null ? null : timestamp(item.lastUpdated, 'LAST_UPDATED');
    if (captured > asOf || observed !== null && observed > captured) throw new Error('OFFER_EVIDENCE_FUTURE');
    const sameDestination = ['productId', 'storeId', 'url'].every(key => item[key] === subject[key]);
    const ageMs = observed === null ? null : asOf - observed;
    return { role: item.role, sameDestination, price: item.price, currency: item.currency,
      stock: item.stock, priceCondition: item.priceCondition, capturedAt: item.capturedAt,
      lastUpdated: item.lastUpdated, ageMs,
      fresh3h: ageMs === null ? null : ageMs <= 3 * 3600000,
      fresh24h: ageMs === null ? null : ageMs <= 24 * 3600000 };
  });
  const byRole = Object.fromEntries(evidence.map(item => [item.role, item]));
  const producer = byRole.producer, publicApi = byRole['public-api'], snapshot = byRole.snapshot;
  const bound = evidence.every(item => item.sameDestination);
  const compare = (left, right, field) => bound && left[field] !== null && right[field] !== null
    ? left[field] === right[field] : null;
  const producerTime = producer.lastUpdated === null ? null : Date.parse(producer.lastUpdated);
  const publicTime = publicApi.lastUpdated === null ? null : Date.parse(publicApi.lastUpdated);
  const differenceMs = !bound || producerTime === null || publicTime === null ? null : producerTime - publicTime;
  const observationsMatch = (left, right) => left.lastUpdated === null || right.lastUpdated === null || !bound
    ? null : Date.parse(left.lastUpdated) === Date.parse(right.lastUpdated);
  const priceKnown = bound && producer.price !== null && publicApi.price !== null;
  return {
    version: 1, asOf: input.asOf, subject, sameDestination: bound,
    status: !bound ? 'different-destination' : differenceMs === null ? 'unknown'
      : differenceMs > 0 ? 'producer-newer-than-public' : differenceMs < 0 ? 'public-newer-than-producer' : 'same-observation',
    evidence,
    producerToPublic: {
      observationDifferenceMs: differenceMs,
      priceDifferenceARS: priceKnown ? Math.round((publicApi.price - producer.price) * 100) / 100 : null,
      roundedWholePesoMatches: priceKnown ? Math.round(publicApi.price) === Math.round(producer.price) : null,
      stockMatches: compare(producer, publicApi, 'stock'),
      conditionMatches: compare(producer, publicApi, 'priceCondition'),
    },
    snapshotToPublic: {
      observationMatches: observationsMatch(snapshot, publicApi),
      priceMatches: compare(snapshot, publicApi, 'price'),
      stockMatches: compare(snapshot, publicApi, 'stock'),
      conditionMatches: compare(snapshot, publicApi, 'priceCondition'),
    },
    limitation: 'Compara campos aportados y fechas de oferta. No verifica MPN, título, compatibilidad, elegibilidad, recepción Analytics ni causa del desfase. No consulta o modifica sistemas.',
  };
}

// La CLI lee un archivo explícito y escribe sólo stdout; no carga entorno o credenciales.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--input') throw new Error('Uso: node scripts/reconcile-offer-evidence.mjs --input archivo.json');
  const content = await readFile(args[1], 'utf8');
  if (Buffer.byteLength(content) > 65536) throw new Error('OFFER_EVIDENCE_SIZE');
  process.stdout.write(`${JSON.stringify(reconcileOfferEvidence(JSON.parse(content)), null, 2)}\n`);
}
