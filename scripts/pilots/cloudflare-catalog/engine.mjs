import { prepareQuery, matchesProduct, hasPortableHint } from './catalog-matchers.mjs';
export const MAX_TEXT_CANDIDATES = 2000;
export const MAX_TEXT_BATCHES = 44;
const SORTS = new Set(['relevance','price-asc','price-desc','name','newest']);
export function validateParams(input = {}) {
  const p = { p_query:'',p_category:null,p_stores:[],p_min_price:null,p_max_price:null,p_sort:'relevance',p_page:1,p_page_size:12,...input };
  if (typeof p.p_query !== 'string' || p.p_query.length > 240 || !Array.isArray(p.p_stores) || p.p_stores.length > 80
    || p.p_stores.some(s=>typeof s!=='string') || !SORTS.has(p.p_sort)
    || !Number.isInteger(p.p_page) || p.p_page<1 || !Number.isInteger(p.p_page_size) || p.p_page_size<1 || p.p_page_size>48
    || [p.p_min_price,p.p_max_price].some(n=>n!==null && (!Number.isFinite(n)||n<0))
    || (p.p_category!==null && typeof p.p_category!=='string')) throw new Error('Invalid catalog page parameters');
  return p;
}
// Todo identificador SQL es estático. Fechas, filtros y lista de IDs son bindings.
function candidatesSql(p, prepared, ids, now) {
  const values = [JSON.stringify(p.p_stores),JSON.stringify(prepared.words),new Date(now-86400000).toISOString(),new Date(now+60000).toISOString(),new Date(now).toISOString()];
  const guards = ['p.catalog_component=1'],guardValues=[];
  if (p.p_category!==null) { guards.push('p.category=?'); guardValues.push(p.p_category); }
  if (prepared.candidate) {
    if(prepared.candidate.length>=3) {guards.push('p.id IN(SELECT id FROM product_substrings WHERE document MATCH ?)');guardValues.push(`"${prepared.candidate.replaceAll('"','""')}"`);}
    guards.push('instr(p.catalog_document,?)>0'); guardValues.push(prepared.candidate);
  }
  if (prepared.kind!=='ram' && prepared.words.length<=2) guards.push("NOT EXISTS(SELECT 1 FROM query_terms q WHERE instr(' '||p.catalog_name||' ',' '||q.term||' ')=0)");
  // La identidad se siembra con las mismas señales necesarias de PostgreSQL;
  // después se amplían sus copias antes de elegir la ficha preferida.
  const keyGuards=guards.map(g=>g.replaceAll('p.','p2.')),keyValues=[...guardValues];
  // Cada palabra es obligatoria en el matcher. RAM transforma unidades dentro
  // del matcher y conserva su documento original en el prefiltro SQL.
  if(prepared.kind!=='ram') guards.push("NOT EXISTS(SELECT 1 FROM query_terms q WHERE instr(' '||p.catalog_document||' ',' '||q.term||' ')=0)");
  if (ids!==null) { guards.push('p.id IN (SELECT value FROM json_each(?))'); guardValues.push(JSON.stringify(ids)); }
  const currentOnly=p.p_min_price!==null||p.p_max_price!==null;
  let recentKeys=currentOnly?`current_identity_keys AS MATERIALIZED(
 SELECT DISTINCT p2.category,p2.catalog_identity FROM summaries recent JOIN products p2 ON p2.id=recent.product_id
 WHERE p2.catalog_component=1 AND recent.comparable_latest_observed_at>=(SELECT earliest FROM clock)
 UNION SELECT p2.category,p2.catalog_identity FROM summaries recent JOIN products p2 ON p2.id=recent.product_id
 WHERE p2.catalog_component=1 AND recent.comparable_stats_json IS NOT NULL AND recent.comparable_valid_until>(SELECT now FROM clock)),`:'';
  if(currentOnly&&keyGuards.length>1) {
    recentKeys=`current_identity_keys AS MATERIALIZED(SELECT DISTINCT p2.category,p2.catalog_identity FROM products p2 JOIN summaries recent ON recent.product_id=p2.id
    WHERE ${keyGuards.join(' AND ')} AND (recent.comparable_latest_observed_at>=(SELECT earliest FROM clock) OR (recent.comparable_stats_json IS NOT NULL AND recent.comparable_valid_until>(SELECT now FROM clock)))),`;
    values.push(...keyValues);
  }
  values.push(...guardValues);
  const seedJoin=currentOnly?'JOIN current_identity_keys active ON active.category=p.category AND active.catalog_identity=p.catalog_identity':'';
  const currentSourceJoin=(currentOnly&&prepared.normalized)||p.p_stores.length?'seed p CROSS JOIN price_basis b INDEXED BY basis_lookup_idx':'price_basis b JOIN seed p ON p.id=b.product_id';
  const historicalSource=p.p_stores.length?`UNION ALL SELECT b.* FROM seed p CROSS JOIN price_basis b INDEXED BY basis_lookup_idx WHERE b.product_id=p.id AND b.kind='historical' AND b.price>0 AND b.store_id IN(SELECT id FROM filter_stores)`:'';
  const sql = `WITH
 filter_stores AS (SELECT value AS id FROM json_each(?)),
 query_terms AS (SELECT value AS term FROM json_each(?)),
 clock AS (SELECT ? AS earliest, ? AS latest,? AS now),
 ${recentKeys}
 seed AS MATERIALIZED (SELECT p.id,p.category,p.catalog_identity,p.catalog_name,p.catalog_document,p.grouped_identity,p.last_scraped_at,p.updated_at,s.lowest AS historical_lowest,s.highest AS historical_highest,s.average AS historical_average,
 s.available AS historical_available,s.urls AS historical_urls,s.portable_listing,s.store_ids_json,s.comparable_stats_json,
 CASE WHEN NOT EXISTS(SELECT 1 FROM filter_stores) AND s.comparable_stats_json IS NOT NULL AND (SELECT now FROM clock)<s.comparable_valid_until THEN 1 ELSE 0 END AS use_cached
 FROM products p ${seedJoin} JOIN summaries s ON s.product_id=p.id WHERE ${guards.join(' AND ')}),
 offer_sources AS (SELECT b.* FROM ${currentSourceJoin}
 WHERE b.product_id=p.id AND b.kind='current' AND b.price>0 AND p.use_cached=0
 AND b.observed_at BETWEEN (SELECT earliest FROM clock) AND (SELECT latest FROM clock)
 ${p.p_stores.length?'AND b.store_id IN(SELECT id FROM filter_stores)':''} ${historicalSource}),
 offered AS(SELECT b.*,ROW_NUMBER() OVER(PARTITION BY b.product_id,b.kind,b.store_id ORDER BY b.price,b.observed_at DESC,b.url) AS store_rank FROM offer_sources b),
 valid AS (SELECT * FROM offered WHERE kind='historical' OR store_rank=1),
 counts AS (SELECT product_id,kind,COUNT(*) FILTER(WHERE stock<>'out-of-stock') AS available,GROUP_CONCAT(url,' ') AS urls FROM valid GROUP BY product_id,kind),
 basis AS (SELECT v.*,c.available,ROW_NUMBER() OVER(PARTITION BY v.product_id,v.kind ORDER BY price) AS rn,
 COUNT(*) OVER(PARTITION BY v.product_id,v.kind) AS n FROM valid v JOIN counts c USING(product_id,kind)
 WHERE c.available=0 OR v.stock<>'out-of-stock'),
 medians AS (SELECT product_id,kind,MAX(n) AS n,MIN(price) AS minimum,MAX(price) AS maximum,
 AVG(price) FILTER(WHERE rn IN(CAST((n+1)/2 AS INTEGER),CAST((n+2)/2 AS INTEGER))) AS median FROM basis GROUP BY product_id,kind),
 accepted AS (SELECT b.* FROM basis b JOIN medians m USING(product_id,kind)
 WHERE m.n<=1 OR (m.n=2 AND NOT(m.maximum/m.minimum>=4 AND m.maximum-m.minimum>=150000 AND b.price=m.maximum))
 OR (m.n>2 AND NOT((b.price/m.median>=2.6 OR b.price/m.median<=0.38) AND ABS(b.price-m.median)>=MAX(50000,ROUND(m.median*0.35))))),
 stats AS (SELECT a.product_id,a.kind,MIN(a.price) AS lowest,MAX(a.price) AS highest,ROUND(AVG(a.price)) AS average,
 MAX(c.available) AS available,MAX(c.urls) AS urls,MAX(a.observed_at) AS observed_at FROM accepted a JOIN counts c USING(product_id,kind) GROUP BY a.product_id,a.kind),
 matched AS (SELECT p.*,COALESCE(CASE WHEN p.use_cached=1 THEN json_extract(p.comparable_stats_json,'$.lowest') END,c.lowest,h.lowest,p.historical_lowest) AS lowest,
 COALESCE(CASE WHEN p.use_cached=1 THEN json_extract(p.comparable_stats_json,'$.highest') END,c.highest,h.highest,p.historical_highest) AS highest,
 COALESCE(CASE WHEN p.use_cached=1 THEN json_extract(p.comparable_stats_json,'$.average') END,c.average,h.average,p.historical_average) AS average,
 COALESCE(CASE WHEN p.use_cached=1 THEN json_extract(p.comparable_stats_json,'$.available') END,c.available,h.available,p.historical_available) AS available,
 COALESCE(CASE WHEN p.use_cached=1 THEN json_extract(p.comparable_stats_json,'$.available') END,c.available,0) AS comparable_available,
 COALESCE(CASE WHEN p.use_cached=1 THEN json_extract(p.comparable_stats_json,'$.urls') END,c.urls,h.urls,p.historical_urls) AS urls,
 CASE WHEN p.use_cached=1 THEN strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(p.comparable_stats_json,'$.observed_at')) ELSE c.observed_at END AS observed_at
 FROM seed p LEFT JOIN stats c ON c.product_id=p.id AND c.kind='current'
 LEFT JOIN stats h ON h.product_id=p.id AND h.kind='historical'
 WHERE NOT EXISTS(SELECT 1 FROM filter_stores) OR EXISTS(SELECT 1 FROM json_each(p.store_ids_json) j JOIN filter_stores f ON f.id=j.value))`;
  return {sql,values};
}
function eligibilitySql(p, prepared, preselected, now) {
  const base=candidatesSql(p,prepared,preselected,now);
  const guards=['identity_rank=1'];
  if (p.p_min_price!==null||p.p_max_price!==null) guards.push('comparable_available>0');
  if (p.p_min_price!==null) {guards.push('lowest>=?');base.values.push(p.p_min_price);}
  if (p.p_max_price!==null) {guards.push('lowest<=?');base.values.push(p.p_max_price);}
  let rank = `ROW_NUMBER() OVER(PARTITION BY category,catalog_identity ORDER BY grouped_identity DESC,last_scraped_at DESC,updated_at DESC,id)`;
  // Sin texto/tiendas y con rango, PostgreSQL prefiere identidad ANTES de frescura.
  if (!prepared.normalized && !p.p_stores.length && (p.p_min_price!==null||p.p_max_price!==null)) rank=`CASE WHEN id=(SELECT p2.id FROM products p2 JOIN summaries s2 ON s2.product_id=p2.id WHERE p2.catalog_component=1 AND p2.category=matched.category AND p2.catalog_identity=matched.catalog_identity ORDER BY p2.grouped_identity DESC,p2.last_scraped_at DESC,p2.updated_at DESC,p2.id LIMIT 1) THEN 1 ELSE 2 END`;
  base.sql+=`,ranked AS(SELECT matched.*,${rank} AS identity_rank FROM matched), eligible AS(SELECT * FROM ranked WHERE ${guards.join(' AND ')})`;
  return base;
}
function ordering(p,prepared,now,values) {
  const order=[];
  if (p.p_sort.startsWith('price-')) order.push('(comparable_available>0) DESC',`lowest ${p.p_sort==='price-asc'?'ASC':'DESC'}`);
  if (p.p_sort==='name') order.push('catalog_name ASC');
  if (p.p_sort==='newest'||(p.p_sort==='relevance'&&!prepared.normalized)) order.push('updated_at DESC');
  if (p.p_sort==='relevance') {
    values.push(new Date(now-86400000).toISOString(),new Date(now+60000).toISOString());
    order.push('CASE WHEN comparable_available=0 THEN 0 WHEN observed_at BETWEEN ? AND ? THEN 2 ELSE 1 END DESC');
    if (prepared.normalized) {
      values.push(` ${prepared.normalized} `,new Date(now-14400000).toISOString(),new Date(now-86400000).toISOString());
      order.push(`(25*(SELECT COUNT(*) FROM query_terms q WHERE instr(' '||catalog_name||' ',' '||q.term||' ')>0)+CASE WHEN NOT EXISTS(SELECT 1 FROM query_terms q WHERE instr(' '||catalog_name||' ',' '||q.term||' ')=0) THEN 120 ELSE 0 END+CASE WHEN instr(' '||catalog_name||' ',?)>0 THEN 120 ELSE 0 END+MAX(0,20-FLOOR(lowest/200000))+MIN(15,MAX(0,comparable_available-1)*5)+CASE WHEN observed_at>=? THEN 18 WHEN observed_at>=? THEN 12 ELSE -12 END) DESC`);
    }
    order.push('lowest ASC');
  }
  order.push('id ASC'); return order.join(',');
}
export async function searchCatalog(db,input,{now=Date.now()}={}) {
  const p=validateParams(input),prepared=prepareQuery(p.p_query,p.p_category);
  let ids=null;
  if (prepared.normalized) {
    const base=candidatesSql(p,prepared,null,now);
    ids=[];let complete=false;
    for(let batch=0;batch<MAX_TEXT_BATCHES;batch++) {
      const rows=await db.all(`${base.sql} SELECT id,catalog_name,catalog_document,(SELECT json_extract(original.row_json,'$.name') FROM products original WHERE original.id=matched.id) AS name,urls FROM matched ORDER BY id LIMIT ${MAX_TEXT_CANDIDATES} OFFSET ${batch*MAX_TEXT_CANDIDATES}`,base.values);
      ids.push(...rows.filter(row=>matchesProduct(row,prepared,row.urls,hasPortableHint(row.urls))).map(row=>row.id));
      if(rows.length<MAX_TEXT_CANDIDATES) {complete=true;break;}
    }
    // No devolver totales truncados: deja seis lecturas para conteo, página,
    // metadatos, ofertas, marcador del snapshot y evidencia opcional de la UI.
    if(!complete) {const error=new Error('CATALOG_CANDIDATE_BUDGET_EXCEEDED');error.code=error.message;throw error;}
  }
  const base=eligibilitySql(p,prepared,ids,now);
  const count=await db.first(`${base.sql} SELECT COUNT(*) AS total FROM eligible`,base.values);
  const total=Number(count.total),totalPages=Math.ceil(total/p.p_page_size),page=Math.max(1,Math.min(p.p_page,Math.max(totalPages,1)));
  const values=[...base.values], order=ordering(p,prepared,now,values);values.push(p.p_page_size,(page-1)*p.p_page_size);
  const rows=await db.all(`${base.sql} SELECT id,lowest,highest,average FROM eligible ORDER BY ${order} LIMIT ? OFFSET ?`,values);
  const idsJson=JSON.stringify(rows.map(row=>row.id));
  const storedRows=await db.all('SELECT id,row_json FROM products WHERE id IN(SELECT value FROM json_each(?))',[idsJson]);
  const storedById=new Map(storedRows.map(row=>[row.id,row]));
  const offers=await db.all(`SELECT product_id,row_json FROM product_prices WHERE product_id IN(SELECT value FROM json_each(?)) ${p.p_stores.length?'AND LOWER(store_id) IN(SELECT value FROM json_each(?))':''} ORDER BY price,store_id,url`,p.p_stores.length?[idsJson,JSON.stringify(p.p_stores)]:[idsJson]);
  const offersById=new Map();for(const offer of offers) {const list=offersById.get(offer.product_id)??[];list.push(JSON.parse(offer.row_json));offersById.set(offer.product_id,list);}
  const products=[];
  for(const row of rows) {
    const stored=storedById.get(row.id);
    const product=JSON.parse(stored.row_json);
    for (const key of ['catalog_name','catalog_document','catalog_identity','catalog_component']) delete product[key];
    products.push({...product,lowest_price:row.lowest,highest_price:row.highest,average_price:row.average,product_prices:offersById.get(row.id)??null});
  }
  return {total,totalPages,page,pageSize:p.p_page_size,products};
}
