// Laboratorio local sin TCP, credenciales, dotenv ni lecturas nuevas de tiendas.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url), ts = require('typescript');
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const sha = value => createHash('sha256').update(value).digest('hex');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const modules = new Set([
 'scrapers/maximus-known-detail', 'scrapers/listing-reference', 'scrapers/static-data', 'scrapers/source-contracts',
 'scrapers/scraper-helpers', 'scrapers/source-title', 'scrapers/brand-utils', 'product-identity', 'price-utils',
 'price-freshness', 'product-sanitizer', 'text-utils', 'product-images', 'catalog/hardware-categories',
 'quality/offer-identity', 'quality/offer-attribute-proof', 'quality/storage-identity',
 'catalog/on-demand/worker', 'persistence/product-read-mapper', 'persistence/product-read-helpers',
]);
function offlineModules(getDetail) {
 const cache = new Map();
 const load = name => {
  assert(modules.has(name), `OFFLINE_MODULE_NOT_APPROVED:${name}`);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const localRequire = specifier => {
   if (specifier === 'server-only') return {};
   if (specifier === 'cheerio') return require(specifier);
   const resolved = specifier.startsWith('@/lib/') ? specifier.slice(6)
    : path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
   const stubs = {
    'scrapers/source-http': { SourceHttpError: class extends Error {}, sourceFetch: () => { throw Error('OFFLINE_TRANSPORT'); } },
    'scrapers/known-product-detail': { fetchKnownProductDetail: async () => getDetail() },
    'scrapers/woocommerce-known-batch': { WOO_BATCH_STORES: new Set() },
    'scrapers/woocommerce-shared': { WOOCOMMERCE_STORES: [] },
    'scrapers/scraper-registry': { getStoreScraper: () => undefined, FRAMEWORK_SCRAPERS: [] },
    'scrapers/compragamer': {}, 'server/supabase-server': {}, 'pc-builder/catalog': {},
    'ai/review-product-offers': {}, 'persistence/product-write-dedupe': {}, 'catalog/refresh-diagnostics': {},
    'async/with-abort-timeout': { withAbortTimeout: fn => fn(undefined) },
   };
   return Object.hasOwn(stubs, resolved) ? stubs[resolved] : load(resolved);
  };
  const code = ts.transpileModule(read(`src/lib/${name}.ts`), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, URL, Date }, { filename: name, timeout: 3000 });
  return module.exports;
 };
 return load;
}
function fixture() {
 const source = read('src/lib/scrapers/maximus-known-detail.test.ts');
 const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.ES2022, true);
 const selected = ast.statements.flatMap(statement => {
  if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'payload') return [statement.getText(ast)];
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.filter(declaration => ['url', 'at', 'html'].includes(declaration.name.getText(ast))).map(declaration => `const ${declaration.getText(ast)};`);
 });
 assert.equal(selected.length, 4);
 const module = { exports: {} };
 const code = ts.transpileModule(`${selected.join('\n')}\nmodule.exports={url,at,html,payload};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(code, { module, Date }, { timeout: 3000 });
 return module.exports;
}
const lit = value => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
async function main() {
 assert.equal(process.argv.length, 4, 'USAGE: node script.mjs captured-function.sql receipt.json');
 const baseline = fs.readFileSync(path.resolve(process.argv[2]), 'utf8').trimEnd() + '\n';
 assert.equal(createHash('md5').update(baseline).digest('hex'), 'f66ccd0f002da0ddf8b8b4f8e8ecd992', 'REMOTE_DEFINITION_DRIFT');
 const output = path.resolve(process.argv[3]);
 const migration = fs.readdirSync(path.join(root, 'supabase/migrations')).find(name => name.endsWith('_allow_maximus_observed_special_price.sql'));
 assert(migration, 'MIGRATION_MISSING');
 const sources = [{ path: process.argv[2], sha256: sha(baseline) }];
 const f = fixture();
 const evidenceRoot = path.dirname(path.resolve(process.argv[2]));
 const live = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'maximus-live-result.json'), 'utf8'));
 const liveHtml = fs.readFileSync(path.join(evidenceRoot, 'maximus-12032-page-live.html'), 'utf8');
 const liveRaw = fs.readFileSync(path.join(evidenceRoot, 'maximus-12032-detail-live.txt'), 'utf8');
 assert.equal(sha(liveHtml), live.requests[0].sha256); assert.equal(sha(liveRaw), live.requests[1].sha256);
 const livePayload = JSON.parse(JSON.parse(liveRaw).d);
 let source;
 const load = offlineModules(() => source);
 const parse = load('scrapers/maximus-known-detail').parseMaximusKnownDetail;
 const worker = load('catalog/on-demand/worker');
 const mapper = load('persistence/product-read-mapper').mapDbProduct;
 const comparable = load('price-utils').isComparableStoreOffer;
 const fresh = load('price-freshness').isCatalogOfferFresh;
 const historical = parse(f.payload(), f.html, f.url, 'procesadores', f.at);
 assert.equal(historical.prices[0].price, 323190);
 assert.equal(historical.prices[0].lastUpdated.toISOString(), '2026-10-07T02:44:28.601Z');
 source = historical;
 const historicalTarget = { productId: 'maximus-local', storeId: 'maximus', url: f.url };
 const target = { ...historicalTarget, url: live.target };
 assert.equal(await worker.fetchKnownOffer(historical, historicalTarget, Date.now(), worker.createKnownOfferContext(true)), null, 'HISTORICAL_READ_REDATED');
 // Fecha original de las dos lecturas públicas; nunca renovar una fixture histórica.
 const startedAt = Date.parse(live.startedAt), observedAt = new Date(live.product.prices[0].lastUpdated);
 source = parse(livePayload, liveHtml, live.target, 'procesadores', observedAt);
 const observation = await worker.fetchKnownOffer(source, target, startedAt, worker.createKnownOfferContext(true));
 assert(observation);
 const price = observation.price;
 assert.equal(price.sourceIdentity.listingRef, 'maximus:id:12032');
 assert.equal(price.sourceIdentity.storeSku, '100-100000593WOF');
 assert.equal(price.sourceIdentity.sourceId, '12032');
 assert.equal(price.priceCondition, 'special');
 let local, running = false, receipt;
 const run = (name, args, input) => execFileSync(pg + name, args, { input, env: childEnv, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], maxBuffer: 10 * 1024 * 1024 });
 try {
  local = fs.mkdtempSync('/tmp/comparador-maximus-'); fs.chmodSync(local, 0o700);
  const data = path.join(local, 'data'), socket = path.join(local, 'socket'); fs.mkdirSync(socket, { mode: 0o700 });
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  running = true;
  run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', `-h '' -k ${socket} -p 55496 -c cluster_name=maximus-local`, '-w', 'start']);
  run('createdb', ['-h', socket, '-p', '55496', '-U', 'postgres', 'maximus_local']);
  const query = sql => run('psql', ['-X', '-h', socket, '-p', '55496', '-U', 'postgres', '-d', 'maximus_local', '-v', 'ON_ERROR_STOP=1', '-Atq'], sql).trim();
  assert.equal(query('SHOW data_directory;'), data); assert.equal(query('SHOW listen_addresses;'), '');
  query(read('supabase/tests/bootstrap-local.sql')); query('ALTER ROLE service_role BYPASSRLS;');
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name) && name <= '20261006024548_current_catalog_bounded_candidates_function.sql' && name !== '20261006002340_private_measurement_dashboard.sql').sort();
  for (const name of migrations) query(read(`supabase/migrations/${name}`));
  const signature = "'public.persist_adaptive_offer(uuid,uuid,numeric,numeric,text,integer,numeric,timestamptz,timestamptz,jsonb,text,jsonb,text)'::regprocedure";
  const repositoryDefinitionMd5 = query(`SELECT md5(pg_get_functiondef(${signature}));`);
  console.log(JSON.stringify({repositoryDefinitionMd5}));
  // La instalación desde historial también debe aceptar la misma migración revisada.
  query(read(`supabase/migrations/${migration}`));
  query(baseline + ';');
  assert.equal(query(`SELECT md5(pg_get_functiondef(${signature}));`), 'f66ccd0f002da0ddf8b8b4f8e8ecd992');
  const acl = query(`SELECT proacl::text FROM pg_proc WHERE oid=${signature};`);
  const metadataBefore = query(`SELECT jsonb_build_object('owner',proowner,'settings',proconfig,'invoker',NOT prosecdef) FROM pg_proc WHERE oid=${signature};`);
  const offer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  query(`INSERT INTO products(id,name,model,category) VALUES ('maximus-local',${lit(source.name)},'7600X','procesadores');
   INSERT INTO product_prices(id,product_id,store_id,url,price,stock,last_updated) VALUES (${lit(offer)},'maximus-local','maximus',${lit(live.target)},1,'out-of-stock',now()-interval '2 days');
   SELECT seed_catalog_refresh_queue(); UPDATE catalog_offer_refresh_state SET lease_token=${lit(token)},leased_until=now()+interval '10 minutes' WHERE offer_id=${lit(offer)};
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role; GRANT USAGE ON SCHEMA public TO service_role;`);
  const args = { price: price.price, stock: price.stock, condition: price.priceCondition, observed: price.lastUpdated.toISOString(), start: new Date(startedAt).toISOString(), identity: price.sourceIdentity, token, review: price.identityReview ?? null };
  const call = (overrides = {}) => { const a = { ...args, ...overrides }; return query(`SET ROLE service_role; SELECT persist_adaptive_offer(${lit(offer)}::uuid,${lit(a.token)}::uuid,${a.price},null,${lit(a.stock)},null,null,${lit(a.start)}::timestamptz,${lit(a.observed)}::timestamptz,${lit(a.review == null ? null : JSON.stringify(a.review))}::jsonb,'fixture',${lit(a.identity == null ? null : JSON.stringify(a.identity))}::jsonb,${lit(a.condition)});`); };
  const savedRow = () => JSON.parse(query(`SELECT to_jsonb(pp) FROM product_prices pp WHERE id=${lit(offer)};`));
  const before = savedRow(); assert.equal(call(), 'f', 'BASELINE_SHOULD_REJECT_MAXIMUS_SPECIAL'); assert.deepEqual(savedRow(), before);
  query(read(`supabase/migrations/${migration}`));
  assert.equal(query(`SELECT proacl::text FROM pg_proc WHERE oid=${signature};`), acl, 'ACL_CHANGED');
  assert.equal(query(`SELECT jsonb_build_object('owner',proowner,'settings',proconfig,'invoker',NOT prosecdef) FROM pg_proc WHERE oid=${signature};`), metadataBefore, 'FUNCTION_METADATA_CHANGED');
  const expectedDefinition = baseline.replace("'maxtecno','gezatek')", "'maxtecno','gezatek','maximus')");
  assert.equal(query(`SELECT pg_get_functiondef(${signature});`), expectedDefinition.trim(), 'UNRELATED_FUNCTION_CHANGE');
  assert.equal(query(`SELECT prosecdef FROM pg_proc WHERE oid=${signature};`), 'f', 'SECURITY_DEFINER');
  const checks = [];

  const reject = (name, overrides) => { assert.equal(call(overrides), 'f', name); assert.deepEqual(savedRow(), before, name + '_MUTATED_ROW'); checks.push(name); };
  reject('wrong-lease', { token: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
  reject('stale-run', { start: new Date(Date.now() - 31 * 60000).toISOString() });
  reject('historical-observation', { observed: f.at.toISOString() });
  reject('future-observation', { observed: new Date(Date.now() + 120000).toISOString() });
  reject('zero-price', { price: 0 }); reject('invalid-stock', { stock: 'available' });
  reject('missing-identity', { identity: null }); reject('missing-listing', { identity: { title: source.name } });
  for (const title of ['{{ITEMTIT}}','ITEMTIT','<%','§']) reject(`template-title-${title}`, { identity: { ...args.identity, title } });
  reject('invalid-condition', { condition: 'card' });
  assert.equal(call(), 't'); checks.push('maximus-special-saved');
  const stores = ['compragamer','mexx','xtpc','gamingcity','compugarden','maxtecno','gezatek','venex'];
  for (const store of stores) {
   query(`INSERT INTO stores(id,name,url) VALUES (${lit(store)},${lit(store)},${lit(`https://${store}.example.invalid`)}) ON CONFLICT(id) DO NOTHING;`);
   query(`UPDATE product_prices SET store_id=${lit(store)} WHERE id=${lit(offer)};`);
   assert.equal(call(), store === 'venex' ? 'f' : 't', `PAYMENT_STORE_POLICY:${store}`);
   checks.push(`payment-policy-${store}`);
  }
  query(`UPDATE product_prices SET store_id='maximus' WHERE id=${lit(offer)};`);
  const saved = savedRow(); assert.equal(saved.price, 339300); assert.equal(saved.stock, 'in-stock'); assert.equal(saved.price_condition, 'special');
  assert.deepEqual(saved.source_identity, JSON.parse(JSON.stringify(price.sourceIdentity))); assert.equal(Date.parse(saved.last_updated), price.lastUpdated.getTime());
  assert.equal(call(), 't'); assert.equal(query("SELECT count(*) FROM price_history WHERE product_id='maximus-local';"), '1', 'DUPLICATE_RETRY_HISTORY'); checks.push('idempotent-retry');
  assert.equal(query(`SELECT catalog_offer_is_comparable(price,stock,url,identity_review,${lit(source.name)},'procesadores',source_identity,store_id) FROM product_prices WHERE id=${lit(offer)};`), 't', 'SQL_NOT_COMPARABLE');
  const dbProduct = JSON.parse(query("SELECT to_jsonb(p)||jsonb_build_object('product_prices',(SELECT jsonb_agg(pp) FROM product_prices pp WHERE pp.product_id=p.id)) FROM products p WHERE id='maximus-local';"));
  const mapped = mapper(dbProduct); assert(comparable(mapped.prices[0], mapped)); assert(fresh(mapped.prices[0].lastUpdated)); checks.push('database-row-mapped-fresh-comparable');
  const rejectedProduct = mapper({ ...dbProduct, product_prices: [before] });
  fs.writeFileSync(path.join(path.dirname(output),'maximus-persisted-product.json'), JSON.stringify({ product: mapped, comparable: true, localOnly: true, liveObservedAt: observedAt.toISOString(), rejected: { ack: false, rowPreserved: true, product: rejectedProduct, beforeRow: before } }, null, 2) + '\n', { mode: 0o600 });
  assert.equal(call({ stock: 'unknown' }), 't'); assert.equal(savedRow().stock, 'unknown');
  const unknown = mapper({ ...dbProduct, product_prices: [savedRow()] }); assert(!comparable(unknown.prices[0], unknown)); checks.push('unknown-stock-preserved-not-comparable');
  assert.equal(call({ stock: 'out-of-stock' }), 't'); assert.equal(savedRow().stock, 'out-of-stock'); checks.push('out-of-stock-preserved');
  assert.equal(call({ condition: 'unspecified' }), 't'); checks.push('maximus-card-unspecified');
  query(`UPDATE catalog_offer_refresh_state SET leased_until=now()-interval '1 second' WHERE offer_id=${lit(offer)};`);
  assert.equal(call(), 'f'); checks.push('expired-lease');
  assert.equal(query(`SELECT has_function_privilege('anon',${signature},'EXECUTE') OR has_function_privilege('authenticated',${signature},'EXECUTE');`), 'f'); checks.push('private-service-role-only');
  assert.throws(() => query(read(`supabase/migrations/${migration}`)), /MAXIMUS_PERSIST_BASELINE_CHANGED/); checks.push('migration-rejects-baseline-drift');
  for (const name of ['maximus-live-result.json','maximus-12032-page-live.html','maximus-12032-detail-live.txt']) sources.push({ path: path.join(evidenceRoot,name), sha256: sha(fs.readFileSync(path.join(evidenceRoot,name))) });
  for (const name of modules) sources.push({ path: `src/lib/${name}.ts`, sha256: sha(read(`src/lib/${name}.ts`)) });
  sources.push({ path: `supabase/migrations/${migration}`, sha256: sha(read(`supabase/migrations/${migration}`)) });
  receipt = { success: true, localOnly: true, noTcp: true, remoteQueries: 0, productionWrites: 0, postgresVersion: query('SHOW server_version;'),
   repositoryDefinitionMd5, baselineDefinitionMd5: 'f66ccd0f002da0ddf8b8b4f8e8ecd992', baselineAcl: acl, historicalFixtureObservedAt: f.at.toISOString(),
   liveObservationAt: observedAt.toISOString(), liveSourceReadOnly: true, historicalReadRejected: true, mapperWorkerSqlReadMapperChain: true,
   saved: { price: saved.price, stock: saved.stock, sourceIdentity: saved.source_identity, priceCondition: saved.price_condition, observedAt: saved.last_updated }, checks, sources,
   limits: ['Live two-request capture proves the recorded source at that time; future price and availability can change. Historical fixture is rejected without redating.', 'Relevant repository schema replay excluding the private measurement dashboard. Local service_role has broad table grants and BYPASSRLS: this verifies function ACL preservation and SQL behavior, not all production RLS/table privileges. No production rows copied.', 'No deployment, remote refresh, SQL write or account permission change.'] };
 } finally {
  if (running) run('pg_ctl', ['-D', path.join(local, 'data'), '-m', 'immediate', '-w', 'stop']);
  if (local) fs.rmSync(local, { recursive: true, force: true });
 }
 fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
 console.log(JSON.stringify({ success: receipt.success, postgresVersion: receipt.postgresVersion, checks: receipt.checks.length, receipt: output }));
}
await main();
