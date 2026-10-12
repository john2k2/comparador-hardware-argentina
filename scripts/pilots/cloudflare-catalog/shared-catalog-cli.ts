// Dos procesos separados: descubrir no renueva ofertas; refrescar reclama antes de HTTP.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAndStageCompraGamer } from './shared-catalog-local';
import { runLocalSweep } from './sweep-local';
import { proveExactListing } from '@/lib/quality/exact-listing-proof';
import { runSharedRefresh } from './refresh-shared-local';
import { initializeRefreshDemand, enqueueKnownProducts } from './refresh-demand.mjs';
import { canRefreshLocalTarget } from './refresh-local';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { proveOfferAttributes, proveManufacturerRamAttributes } from '@/lib/quality/offer-attribute-proof';
import type { HardwareCategory } from '@/lib/types';

/** Selección privada. Una captura vieja sólo selecciona, jamás suministra el precio. */
export function selectSharedCandidates(db: DatabaseSync, now = Date.now(), limit = 25) {
  if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw new Error('SHARED_CLI_LIMIT');
  const table = db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_listing_observations'").get();
  if (!table) return [];
  const observations = new Map(db.prepare('SELECT * FROM pilot_listing_observations WHERE store_id=?').all('compragamer')
    .filter(row => {
      const at = Date.parse(String(row.observed_at));
      return at <= now && at >= now - 86400000
        && createHash('sha256').update(String(row.row_json)).digest('hex') === row.source_hash;
    }).map(row => [String(row.reference), JSON.parse(String(row.row_json))]));
  const queueExists = Boolean(db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_refresh_demand'").get());
  const pauseExists = Boolean(db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_cycle_store_pause'").get());
  if (pauseExists && db.prepare('SELECT 1 FROM pilot_cycle_store_pause WHERE store_id=? AND until_at>?').get('compragamer', now)) return [];
  const rows = db.prepare(`SELECT pp.id,pp.product_id,pp.url,pp.row_json,p.category,p.row_json product_json
    FROM product_prices pp JOIN products p ON p.id=pp.product_id WHERE pp.store_id=? ORDER BY pp.id`).all('compragamer');
  return rows.filter(row => {
    const raw = JSON.parse(String(row.row_json)), target = JSON.parse(String(row.product_json));
    const queued = queueExists ? db.prepare('SELECT status,due_at,lease_until FROM pilot_refresh_demand WHERE offer_id=?').get(row.id) : undefined;
    if (queued && (queued.status === 'backoff' && Number(queued.due_at) > now
      || queued.status === 'leased' && Number(queued.lease_until) > now)) return false;
    const at = Date.parse(raw.last_updated);
    if (Number.isFinite(at) && at > now - 90 * 60000 && at <= now) return false;
    const reference = listingReference('compragamer', String(row.url));
    const source = reference ? observations.get(reference) : undefined;
    return source && source.category === row.category
      && canRefreshLocalTarget('compragamer', String(row.url), String(row.category), target.name, target.specs)
      && (proveExactListing({title:target.name,category:String(row.category),sku:target.specs?.SKU??''},
          {title:source.name,category:source.category,sku:source.specs?.SKU??''},
          {storeId:'compragamer',url:String(row.url),listingRef:reference!,sourceId:source.id?.startsWith('cg-')?source.id.slice(3):''})
        || proveOfferAttributes(target.name, String(row.category) as HardwareCategory, source.name)
        || row.category === 'memoria-ram' && proveManufacturerRamAttributes(
          { title: target.name, sku: target.specs?.SKU, specs: target.specs },
          { title: source.name, sku: source.specs?.SKU, specs: source.specs },
          { storeId: 'compragamer', url: String(row.url), listingRef: reference! }));
  }).slice(0, limit).map(row => ({ offerId: String(row.id), productId: String(row.product_id) }));
}

export async function sharedCatalogCli(args: string[]) {
  const [mode, file, output] = args;
  if (!['--stage', '--refresh', '--dry-run', '--sweep'].includes(mode) || !file || args.length > 3) throw new Error('SHARED_CLI_USAGE');
  const path = realpathSync(resolve(file));
  if (basename(path) !== 'catalog-all.sqlite') throw new Error('SHARED_CLI_FULL_COPY_REQUIRED');
  const db = new DatabaseSync(path, { readOnly: mode === '--dry-run' });
  try {
    const marker = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
    if (!marker || JSON.parse(String(marker.value)).counts?.product_prices !== db.prepare('SELECT COUNT(*) n FROM product_prices').get()?.n) throw new Error('SHARED_CLI_SNAPSHOT');
    let result;
    if (mode === '--stage') result = await readAndStageCompraGamer(db);
    else {
      const candidates = selectSharedCandidates(db,Date.now(),mode==='--sweep'?500:25);
      if (mode === '--dry-run') result = { localOnly: true, dryRun: true, httpRequests: 0, writes: 0, candidates };
      else {
        initializeRefreshDemand(db);
        for (const candidate of candidates) enqueueKnownProducts(db, { productIds: [candidate.productId], offerIds: [candidate.offerId], storeIds: ['compragamer'], now: Date.now(), freshMs: 3 * 3600000, refreshAheadMs: 90 * 60000 });
        const directory = resolve('scripts/pilots/cloudflare-catalog');
        const { rebuildProjection } = await import(pathToFileURL(resolve(directory, 'projection.mjs')).href);
        const { estimateIndexMaintenance } = await import(pathToFileURL(resolve(directory, 'incremental-sync.mjs')).href);
        result = candidates.length && mode==='--sweep'?await runLocalSweep(db,{projection:rebuildProjection,estimateIndexes:estimateIndexMaintenance},
          {offerIds:candidates.map(c=>c.offerId)}):candidates.length ? await runSharedRefresh(db, { projection: rebuildProjection, estimateIndexes: estimateIndexMaintenance }, { offerIds: candidates.map(c => c.offerId) }) : { localOnly: true, attempted: 0, observed: 0, sourceHttp: { requests: 0, bytes: 0 } };
      }
    }
    if (output) writeFileSync(resolve(output), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
    return result;
  } finally { db.close(); }
}

if (process.argv[1] && /(?:^|\/)shared-catalog-cli\.(?:mjs|ts)$/.test(process.argv[1])) {
  sharedCatalogCli(process.argv.slice(2)).then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('SHARED_CLI_FAILED'); process.exitCode = 1; });
}
