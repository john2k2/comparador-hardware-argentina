// Publicador exclusivo de la muestra. Un batch D1 confirma datos y generación juntos.
const schemas = {
  product_prices: ['id','product_id','store_id','price','url','row_json'],
  summaries: ['product_id','lowest','highest','average','available','urls','portable_listing','store_ids_json','comparable_stats_json','comparable_valid_until','comparable_latest_observed_at','row_json'],
  search_projection: ['product_id','category','catalog_identity','canonical','lowest','highest','average','available','comparable_available','urls','observed_at','next_transition'],
  price_basis: ['product_id','kind','id','store_id','price','stock','url','observed_at'],
};
export function validateSync(payload) {
  if (!payload || typeof payload.expectedSnapshot !== 'string' || typeof payload.finalSnapshot !== 'string' || payload.expectedSnapshot === payload.finalSnapshot || payload.expectedSnapshot.length > 16000 || payload.finalSnapshot.length > 16000) throw new Error('PILOT_SYNC_SNAPSHOT');
  const marker = JSON.parse(payload.finalSnapshot), previous = JSON.parse(payload.expectedSnapshot);
  if (marker.projectionVersion !== 1 || marker.cache?.version !== 1 || typeof marker.cache.generation !== 'string' || !marker.cache.generation || marker.cache.generation.length > 128 || marker.cache.generation === previous.cache?.generation || !Number.isFinite(Date.parse(marker.cache.validFrom)) || !Number.isFinite(Date.parse(marker.cache.validUntil)) || Date.parse(marker.cache.validUntil) <= Date.parse(marker.cache.validFrom)) throw new Error('PILOT_SYNC_PROJECTION');
  if (!Array.isArray(payload.basisProductIds) || payload.basisProductIds.length > 3 || payload.basisProductIds.some(x => typeof x !== 'string')) throw new Error('PILOT_SYNC_SCOPE');
  const basis = new Set(payload.basisProductIds);
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const numeric = (value, nullable=false) => (nullable && value === null) || typeof value === 'number' && Number.isFinite(value);
  const json = value => {if(typeof value !== 'string')throw new Error('PILOT_SYNC_JSON');return JSON.parse(value);};
  const changedOffers = new Map();
  for (const [table, fields] of Object.entries(schemas)) {
    const rows = payload[table];
    if (!Array.isArray(rows) || rows.length > (table === 'search_projection' ? 200 : table === 'price_basis' ? 200 : 3)) throw new Error('PILOT_SYNC_SCOPE');
    for (const row of rows) {
      if (!row || Object.keys(row).length !== fields.length || fields.some(f => !(f in row) || ![null,'string','number'].includes(row[f] === null ? null : typeof row[f]) || (typeof row[f] === 'number' && !Number.isFinite(row[f])))) throw new Error('PILOT_SYNC_ROW');
      if (JSON.stringify(row).length > 40000) throw new Error('PILOT_SYNC_ROW_SIZE');
      for (const key of ['id','product_id','store_id','category','catalog_identity']) if(key in row && (typeof row[key] !== 'string' || !row[key])) throw new Error('PILOT_SYNC_TYPE');
      for (const key of ['price','lowest','highest','average','available','comparable_available']) if(key in row && !numeric(row[key],!['price'].includes(key))) throw new Error('PILOT_SYNC_TYPE');
      for (const key of ['available','comparable_available']) if(key in row && row[key] !== null && (!Number.isSafeInteger(row[key]) || row[key]<0))throw new Error('PILOT_SYNC_TYPE');
      for (const key of ['canonical','portable_listing'])if(key in row && ![0,1].includes(row[key]))throw new Error('PILOT_SYNC_TYPE');
      for (const key of ['observed_at','comparable_valid_until','comparable_latest_observed_at','next_transition'])if(key in row && row[key]!==null && !date(row[key]))throw new Error('PILOT_SYNC_DATE');
      if('urls' in row && row.urls!==null && typeof row.urls!=='string')throw new Error('PILOT_SYNC_TYPE');
      if('url' in row && (typeof row.url!=='string' || !row.url.startsWith('https://')))throw new Error('PILOT_SYNC_TYPE');
      if('row_json' in row) {
        const raw=json(row.row_json); if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('PILOT_SYNC_JSON');
        if(table==='product_prices') {
          if(raw.id!==row.id || raw.product_id!==row.product_id || raw.store_id!==row.store_id || raw.price!==row.price || raw.url!==row.url || !date(raw.last_updated))throw new Error('PILOT_SYNC_OFFER');
          changedOffers.set(row.id,raw);
        }
      }
      if('store_ids_json' in row && !Array.isArray(json(row.store_ids_json)))throw new Error('PILOT_SYNC_JSON');
      if('comparable_stats_json' in row && row.comparable_stats_json!==null && !json(row.comparable_stats_json))throw new Error('PILOT_SYNC_JSON');
      if (table === 'price_basis' && (!basis.has(row.product_id) || !['current','historical'].includes(row.kind) || row.price <= 0 || (row.kind === 'current' && !['in-stock','low-stock'].includes(row.stock)))) throw new Error('PILOT_SYNC_BASIS');
      if (table === 'product_prices' && !basis.has(row.product_id)) throw new Error('PILOT_SYNC_SCOPE');
      if(table==='price_basis' && row.kind==='current') {
        if(!date(row.observed_at))throw new Error('PILOT_SYNC_DATE');
        const raw=changedOffers.get(row.id);
        if(raw && (raw.product_id!==row.product_id || raw.store_id!==row.store_id || raw.price!==row.price || raw.url!==row.url || raw.stock!==row.stock || Date.parse(raw.last_updated)!==Date.parse(row.observed_at)))throw new Error('PILOT_SYNC_CURRENT_CONFLICT');
      }
    }
  }
  if (JSON.stringify(payload).length > 128000) throw new Error('PILOT_SYNC_SIZE');
  return payload;
}
export async function applyRemoteSync(db, input) {
  const p = validateSync(input), statements = [];
  const add = (sql, values = []) => statements.push(db.prepare(sql).bind(...values));
  add('CREATE TABLE IF NOT EXISTS pilot_sync_guard(id INTEGER PRIMARY KEY CHECK(id=1),expected TEXT NOT NULL,actual TEXT NOT NULL CHECK(expected=actual))');
  // CHECK aborta TODO el batch si otro publicador avanzó desde nuestra copia.
  add("INSERT OR REPLACE INTO pilot_sync_guard VALUES(1,?,(SELECT value FROM pilot_meta WHERE key='snapshot'))", [p.expectedSnapshot]);
  for (const table of ['product_prices','summaries','search_projection']) {
    if (!p[table].length) continue;
    const fields = schemas[table], pk = table === 'product_prices' ? 'id' : 'product_id';
    add(`INSERT INTO ${table}(${fields.join(',')}) SELECT ${fields.map(f => `json_extract(value,'$.${f}')`).join(',')} FROM json_each(?) WHERE 1 ON CONFLICT(${pk}) DO UPDATE SET ${fields.filter(f => f !== pk).map(f => `${f}=excluded.${f}`).join(',')}`, [JSON.stringify(p[table])]);
  }
  add('DELETE FROM price_basis WHERE product_id IN(SELECT value FROM json_each(?))', [JSON.stringify(p.basisProductIds)]);
  if (p.price_basis.length) add(`INSERT INTO price_basis(${schemas.price_basis.join(',')}) SELECT ${schemas.price_basis.map(f => `json_extract(value,'$.${f}')`).join(',')} FROM json_each(?)`, [JSON.stringify(p.price_basis)]);
  // La base actual también debe coincidir con ofertas no modificadas del corte.
  add(`INSERT OR REPLACE INTO pilot_sync_guard SELECT 1,'basis-consistent',CASE WHEN EXISTS(
    SELECT 1 FROM price_basis b LEFT JOIN product_prices pp ON pp.id=b.id AND pp.product_id=b.product_id
    WHERE b.product_id IN(SELECT value FROM json_each(?)) AND b.kind='current' AND
      (pp.id IS NULL OR pp.store_id<>b.store_id OR ABS(pp.price-b.price)>0.0000001 OR pp.url<>b.url
       OR json_extract(pp.row_json,'$.stock') IS NOT b.stock OR julianday(json_extract(pp.row_json,'$.last_updated')) IS NOT julianday(b.observed_at))
  ) THEN 'basis-conflict' ELSE 'basis-consistent' END`,[JSON.stringify(p.basisProductIds)]);
  add("UPDATE pilot_meta SET value=? WHERE key='snapshot'", [p.finalSnapshot]);
  add('DELETE FROM pilot_sync_guard WHERE id=1');
  const result = await db.batch(statements);
  if (result.some(r => !r.success)) throw new Error('PILOT_SYNC_BATCH_FAILED');
  return { statements: result.length, rowsRead: result.reduce((n,r) => n + (r.meta?.rows_read ?? 0), 0), rowsWritten: result.reduce((n,r) => n + (r.meta?.rows_written ?? 0), 0), atomic: true, generation: JSON.parse(p.finalSnapshot).cache.generation };
}
