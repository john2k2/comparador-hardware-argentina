import {stableCandidateGuards,validateParams} from './engine.mjs';
import {prepareQuery} from './catalog-matchers.mjs';
import {queryCacheProbe,queryCertificate} from './response-cache.mjs';

// Superset previo a precio/frescura/matcher: incluye futuras entradas al resultado.
export function queryClockSql(input,now) {
  const p=validateParams(input),prepared=prepareQuery(p.p_query,p.p_category);
  const {guards,values}=stableCandidateGuards(p,prepared);
  const peers=p.p_min_price!==null||p.p_max_price!==null;
  return {values:[values[0],new Date(now).toISOString(),...values.slice(1)],sql:`WITH
 query_terms AS(SELECT value term FROM json_each(?)),clock AS(SELECT ? now),
 scope AS MATERIALIZED(SELECT p.id,p.category,p.catalog_identity,v.next_transition
 FROM products p JOIN search_projection v ON v.product_id=p.id WHERE ${guards.join(' AND ')}),
 dependencies AS MATERIALIZED(SELECT * FROM scope ${peers?`UNION SELECT v.product_id,v.category,v.catalog_identity,v.next_transition
 FROM(SELECT DISTINCT category,catalog_identity FROM scope) keys
 JOIN search_projection v INDEXED BY projection_identity_idx USING(category,catalog_identity)`:''}),
 expired AS MATERIALIZED(SELECT product_id FROM search_projection INDEXED BY projection_clock_idx
 WHERE next_transition<=(SELECT now FROM clock) AND product_id IN(SELECT id FROM dependencies)),
 times AS(SELECT next_transition time FROM dependencies WHERE next_transition>(SELECT now FROM clock)
 UNION ALL SELECT strftime('%Y-%m-%dT%H:%M:%fZ',b.observed_at,'-60 seconds')
 FROM expired e CROSS JOIN price_basis b INDEXED BY basis_lookup_idx
 WHERE b.product_id=e.product_id AND b.kind='current' AND b.price>0
 UNION ALL SELECT strftime('%Y-%m-%dT%H:%M:%fZ',b.observed_at,'+4 hours','+0.001 seconds')
 FROM expired e CROSS JOIN price_basis b INDEXED BY basis_lookup_idx
 WHERE b.product_id=e.product_id AND b.kind='current' AND b.price>0
 UNION ALL SELECT strftime('%Y-%m-%dT%H:%M:%fZ',b.observed_at,'+24 hours','+0.001 seconds')
 FROM expired e CROSS JOIN price_basis b INDEXED BY basis_lookup_idx
 WHERE b.product_id=e.product_id AND b.kind='current' AND b.price>0
 UNION ALL SELECT s.comparable_valid_until FROM expired e JOIN summaries s ON s.product_id=e.product_id
 WHERE s.comparable_stats_json IS NOT NULL)
 SELECT COALESCE(MIN(time),'9999-12-31T23:59:59.999Z') next_transition FROM times WHERE time>(SELECT now FROM clock)`};
}
export async function queryClockCertificate(db,input,{now,snapshot}) {
  const p=validateParams(input),probe=queryCacheProbe(snapshot,now);
  if(p.p_stores.length||!probe) return null;
  const statement=queryClockSql(p,now),row=await db.first(statement.sql,statement.values);
  return queryCertificate(probe,Date.parse(row?.next_transition),now);
}
