// Sólo cluster PG17 propio/sintético; no acepta URL, puerto ni credenciales externas.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const report = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(report, '../../..');
const local = path.join(root, 'tmp/history-retention-local-2026-10-07');
const data = path.join(local, `data-${Date.now()}`);
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const args = ['-h', '127.0.0.1', '-p', '55484', '-U', 'postgres', '-d', 'history_retention_local',
  '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'];
const run = (binary, argv) => execFileSync(pg + binary, argv, {
  encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
});
const query = sql => run('psql', [...args, '-c', sql]).trim();
const pilot = readFileSync(path.join(report, 'history-pilot.sql'), 'utf8');
const preflight = readFileSync(path.join(report, 'history-preflight.sql'), 'utf8');
const fixture = readFileSync(path.join(report, 'fixture-history.sql'), 'utf8');
const fixtureRows = fixture.slice(fixture.indexOf('INSERT INTO public.price_history'));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const approve = (sql, { cursor = '', batch = 1, prior = 0, role = 'service_role', commit = false } = {}) => {
  assert.match(cursor, /^(?:[a-f0-9-]{36})?$/);
  assert.ok(['service_role', 'anon', 'postgres'].includes(role));
  const result = sql.replace('BEGIN ISOLATION LEVEL REPEATABLE READ;',
    `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE ${role};
SET LOCAL app.history_cleanup_approved='history-retention-2026-10-07-v1';
SET LOCAL app.history_cleanup_batch='${batch}';
SET LOCAL app.history_cleanup_prior_deleted='${prior}';
SET LOCAL app.history_cleanup_cursor='${cursor}';`);
  return commit ? result.replace(/^ROLLBACK;$/m, 'COMMIT;') : result;
};
const receipt = options => JSON.parse(query(approve(pilot, options)));
const rows = () => JSON.parse(query('SELECT coalesce(jsonb_agg(to_jsonb(ph) ORDER BY id),\'[]\'::jsonb) FROM price_history ph;'));
const reset = () => query('TRUNCATE public.price_history;' + fixtureRows);
const sentinel = () => query(`SELECT jsonb_build_object(
  'products',(SELECT jsonb_agg(p ORDER BY id) FROM products p),
  'stores',(SELECT jsonb_agg(s ORDER BY id) FROM stores s),
  'prices',(SELECT jsonb_agg(p ORDER BY id) FROM product_prices p),
  'users',(SELECT jsonb_agg(u ORDER BY id) FROM user_profiles u));`);
const oracle = () => JSON.parse(query(`WITH ranked AS (
  SELECT id,recorded_at,
  row_number() OVER (PARTITION BY product_id,store_id,coalesce(offer_url,''),date_trunc('hour',recorded_at AT TIME ZONE 'UTC') ORDER BY recorded_at DESC,id DESC) h,
  row_number() OVER (PARTITION BY product_id,store_id,coalesce(offer_url,''),date_trunc('day',recorded_at AT TIME ZONE 'UTC') ORDER BY recorded_at DESC,id DESC) d
  FROM price_history)
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM ranked WHERE
  recorded_at<'2026-10-07T15:45:00Z'::timestamptz-interval '365 days'
  OR (recorded_at<'2026-10-07T15:45:00Z'::timestamptz-interval '90 days'
    AND recorded_at>='2026-10-07T15:45:00Z'::timestamptz-interval '365 days' AND d>1)
  OR (recorded_at<'2026-10-07T15:45:00Z'::timestamptz-interval '14 days'
    AND recorded_at>='2026-10-07T15:45:00Z'::timestamptz-interval '90 days' AND h>1);`));

const cases = [];
const measured = [];
let started = false;
let stopped = false;
let activeHolder;
try {
  // Nunca reutilizar/parar un servidor ajeno, aunque sea PostgreSQL en el puerto previsto.
  try {
    run('pg_isready', ['-h', '127.0.0.1', '-p', '55484']);
    throw new Error('LOCAL_PORT_ALREADY_IN_USE');
  } catch (error) {
    if (error.status !== 2) throw error;
  }
  mkdirSync(local, { recursive: true });
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', path.join(data, 'server.log'), '-o',
    "-h 127.0.0.1 -p 55484 -c unix_socket_directories='' -c cluster_name=history-retention-local-2026-10-07", '-w', 'start']);
  started = true;
  run('createdb', ['-h', '127.0.0.1', '-p', '55484', '-U', 'postgres', 'history_retention_local']);
  assert.equal(query('SHOW cluster_name;'), 'history-retention-local-2026-10-07');
  const serverVersion = query('SHOW server_version;');
  assert.match(serverVersion, /^17\./);
  query(fixture);
  const untouched = sentinel();
  const initialRows = rows();
  assert.throws(() => query(pilot), /HISTORY_CLEANUP_REQUIRES_EXPLICIT_APPROVAL/);
  assert.throws(() => receipt({ role: 'anon' }), /HISTORY_CLEANUP_OPERATOR_ROLE_REQUIRED/);
  assert.throws(() => receipt({ batch: 5 }), /HISTORY_CLEANUP_OPERATOR_LEDGER_REQUIRED/);
  assert.throws(() => receipt({ batch: 1, prior: 1 }), /HISTORY_CLEANUP_OPERATOR_LEDGER_REQUIRED/);
  assert.throws(() => query(approve(pilot).replace("SET LOCAL app.history_cleanup_batch='1';", '')),
    /HISTORY_CLEANUP_OPERATOR_LEDGER_REQUIRED/);
  assert.deepEqual(rows(), initialRows);
  cases.push('approval/role/operator-ledger guards; no writes on rejection');

  const pf = JSON.parse(query(preflight));
  const expectedDeleted = oracle();
  assert.equal(pf.examinedRows, 30);
  assert.equal(pf.candidateRows, expectedDeleted.length);
  const dry = receipt();
  assert.equal(dry.deletedRows, expectedDeleted.length);
  assert.equal(dry.candidateRows, pf.candidateRows);
  assert.ok(Number.isFinite(Date.parse(dry.executedAt)));
  assert.equal(dry.globalEligibilityUnknown, true);
  assert.deepEqual(rows(), initialRows);
  cases.push('bounded preflight agrees with independent rank oracle; default rollback preserves every field');

  const committed = receipt({ commit: true });
  assert.equal(committed.deletedRows, expectedDeleted.length);
  assert.deepEqual(rows(), initialRows.filter(row => !expectedDeleted.includes(row.id)));
  const kept = rows().map(row => row.id);
  for (const n of [3, 4, 6, 7, 10, 12, 13, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 27, 30]) {
    assert.ok(kept.includes(id(n)), `preserved fixture ${n}`);
  }
  for (const n of [1, 2, 5, 8, 9, 11, 14, 20, 26, 28, 29]) {
    assert.ok(!kept.includes(id(n)), `deleted eligible fixture ${n}`);
  }
  cases.push('UTC14/90/365 boundaries; buckets crossing tiers; latest timestamp/id; URL/product/store separation; null/empty equivalence; leap date; raw/future preserved');

  query(`TRUNCATE price_history; INSERT INTO price_history(id,product_id,store_id,offer_url,price,recorded_at)
    SELECT ('00000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'p','s','bulk',100,
    '2026-08-01T10:00:00Z'::timestamptz + g*interval '1 microsecond' FROM generate_series(1,1501) g;`);
  let cursor = '';
  let prior = 0;
  for (let batch = 1; batch <= 4; batch++) {
    const start = performance.now();
    const r = receipt({ cursor, batch, prior, commit: true });
    assert.equal(r.deletedRows, 250);
    assert.ok(r.examinedRows <= 1000);
    assert.equal(r.cursorTo, id(batch * 250));
    assert.equal(r.moreCandidatesInWindow, true);
    cursor = r.cursorTo;
    prior += r.deletedRows;
    measured.push({ ...r, clientElapsedMs: Math.round(performance.now() - start), syntheticCommitAcknowledged: true });
  }
  assert.equal(prior, 1000);
  assert.equal(query('SELECT count(*) FROM price_history;'), '501');
  assert.equal(query(`SELECT count(*) FROM price_history WHERE id='${id(1501)}';`), '1');
  assert.throws(() => receipt({ cursor, batch: 5, prior }), /HISTORY_CLEANUP_OPERATOR_LEDGER_REQUIRED/);
  cases.push('four250 commits;1000 maximum; cursor retains excess candidates; keeper outside scanned window preserved');

  query(`TRUNCATE price_history; INSERT INTO price_history(id,product_id,store_id,offer_url,price,recorded_at)
    SELECT ('00000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'p','s','raw-window',100,
    CASE WHEN g=1001 THEN '2024-02-29T00:00:00Z' ELSE '2026-10-01T00:00:00Z' END::timestamptz
    FROM generate_series(1,1001) g;`);
  const empty = receipt({ commit: true });
  assert.equal(empty.examinedRows, 1000);
  assert.equal(empty.deletedRows, 0);
  assert.equal(empty.scanReachedEndAtSnapshot, false);
  assert.equal(empty.globalEligibilityUnknown, true);
  const next = receipt({ cursor: empty.cursorTo, batch: 2, commit: true });
  assert.equal(next.deletedRows, 1);
  cases.push('zero candidates in one window does not imply global exhaustion; next cursor finds later eligible row');

  async function hold(sql, seconds = 0.8) {
    const child = spawn(pg + 'psql', [...args, '-c', `BEGIN;
      SET LOCAL application_name='history-retention-own-holder';${sql};SELECT pg_sleep(${seconds});COMMIT;`],
    { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.resume();
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr)));
    });
    done.catch(() => {});
    activeHolder = { child, done };
    let sleeping = false;
    for (let i = 0; i < 30; i++) {
      if (query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='history-retention-own-holder' AND wait_event='PgSleep');") === 't') {
        sleeping = true; break;
      }
      await delay(10);
    }
    assert.ok(sleeping, 'Observed own concurrent transaction before the test');
    return { done };
  }

  for (const target of [1, 12]) {
    reset();
    const before = rows();
    const pending = await hold(`SELECT id FROM price_history WHERE id='${id(target)}' FOR UPDATE`);
    assert.throws(() => receipt({ commit: true }), /lock timeout/);
    await pending.done;
    assert.deepEqual(rows(), before);
    assert.equal(receipt().cursorFrom, null);
  }
  cases.push('candidate and keeper locks abort entire batch at200ms; no skip/no cursor advancement/no partial deletion');

  reset();
  const moved = await hold(`UPDATE price_history SET recorded_at='2026-10-01T00:00:00Z' WHERE id='${id(1)}'`, 0.15);
  let movedError;
  try {
    receipt({ commit: true });
    assert.fail('Concurrent movement of a selected row must abort this snapshot');
  } catch (error) {
    assert.match(String(error), /could not serialize access due to concurrent update|lock timeout/);
    movedError = error.stderr.trim();
  }
  await moved.done;
  assert.equal(query(`SELECT recorded_at='2026-10-01T00:00:00Z' FROM price_history WHERE id='${id(1)}';`), 't');
  assert.equal(query('SELECT count(*) FROM price_history;'), '30');
  cases.push('concurrent selected-row movement aborts snapshot; renewed observation preserved; no partial deletion');

  reset();
  const inserted = await hold(`INSERT INTO price_history(id,product_id,store_id,offer_url,price,recorded_at)
    VALUES('${id(31)}','p','s','hourly',999,'2026-08-01T01:59:59.999999Z')`);
  const concurrentReceipt = receipt({ commit: true });
  await inserted.done;
  assert.equal(query(`SELECT count(*) FROM price_history WHERE id IN ('${id(12)}','${id(31)}');`), '2');
  assert.equal(concurrentReceipt.deletedRows, expectedDeleted.length);
  cases.push('concurrent insert preserved; snapshot keeper preserved conservatively without before-minus-after arithmetic');

  reset();
  query(`CREATE FUNCTION synthetic_delete_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN OLD; END$$;
    CREATE TRIGGER synthetic_delete BEFORE DELETE ON price_history FOR EACH ROW EXECUTE FUNCTION synthetic_delete_trigger();`);
  assert.throws(() => receipt(), /HISTORY_CLEANUP_SIDE_EFFECT_REVIEW_REQUIRED/);
  query('DROP TRIGGER synthetic_delete ON price_history; DROP FUNCTION synthetic_delete_trigger();');
  query('CREATE TABLE synthetic_child(history_id uuid REFERENCES price_history(id) ON DELETE CASCADE);');
  assert.throws(() => receipt(), /HISTORY_CLEANUP_SIDE_EFFECT_REVIEW_REQUIRED/);
  query('DROP TABLE synthetic_child;');
  assert.equal(sentinel(), untouched);
  cases.push('delete trigger/outgoing cascade guards; products/prices/users/stores unchanged');

  // Políticas sólo sintéticas: comprobar recibo/cursor ante un DELETE que filtra filas.
  query(`ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
    CREATE POLICY synthetic_select ON price_history FOR SELECT TO service_role USING(true);
    CREATE POLICY synthetic_update ON price_history FOR UPDATE TO service_role USING(true) WITH CHECK(true);
    CREATE POLICY synthetic_delete ON price_history FOR DELETE TO service_role USING(false);`);
  const beforeFilteredDelete = rows();
  let incompleteReceipt;
  try {
    receipt({ commit: true });
    assert.fail('A filtered deletion must abort before COMMIT');
  } catch (error) {
    assert.match(String(error), /HISTORY_CLEANUP_INCOMPLETE_BATCH/);
    incompleteReceipt = JSON.parse(error.stdout.trim());
  }
  assert.equal(incompleteReceipt.candidateRows, expectedDeleted.length);
  assert.equal(incompleteReceipt.deletedRows, 0);
  assert.equal(incompleteReceipt.batchComplete, false);
  assert.equal(incompleteReceipt.cursorTo, incompleteReceipt.cursorFrom);
  assert.deepEqual(rows(), beforeFilteredDelete);
  query(`DROP POLICY synthetic_select ON price_history; DROP POLICY synthetic_update ON price_history;
    DROP POLICY synthetic_delete ON price_history; ALTER TABLE price_history DISABLE ROW LEVEL SECURITY;`);
  cases.push('filtered DELETE produces incomplete receipt, unchanged cursor and transaction abort before COMMIT; RLS changed only synthetically');

  const beforeTimeout = rows();
  assert.throws(() => query(approve(pilot).replace('WITH settings AS MATERIALIZED',
    'SELECT pg_sleep(3.1);\nWITH settings AS MATERIALIZED')), /statement timeout/);
  assert.deepEqual(rows(), beforeTimeout);
  cases.push('3s statement timeout aborts transaction and preserves all rows');

  const preflightStatement = preflight.slice(preflight.indexOf('WITH settings'), preflight.indexOf('\nROLLBACK;'));
  const explain = JSON.parse(query('EXPLAIN (FORMAT JSON) ' + preflightStatement));
  const planNodes = [];
  function visitPlan(node) {
    planNodes.push({ node: node['Node Type'], subplan: node['Subplan Name'], index: node['Index Name'] });
    for (const child of node.Plans ?? []) visitPlan(child);
  }
  visitPlan(explain[0].Plan);
  assert.ok(!planNodes.some(node => node.node === 'WindowAgg'));

  run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  stopped = true;
  const evidence = {
    recordedAt: new Date().toISOString(), status: 'LOCAL_SYNTHETIC_ONLY', base: 'e420dc0',
    serverVersion, host: '127.0.0.1', port: 55484, database: 'history_retention_local',
    clusterDirectory: path.relative(root, data), clusterStopped: true,
    cutoff: '2026-10-07T15:45:00Z', cases, semanticFixtureRows: 30,
    independentOracleEligibleRows: expectedDeleted.length, defaultRollbackReceipt: dry,
    committedBatches: measured, boundedZeroReceipt: empty, concurrentInsertReceipt: concurrentReceipt,
    concurrentMovementError: movedError, incompleteDeleteReceipt: incompleteReceipt, localPreflightPlanNodes: planNodes,
    limits: ['No remote SQL/RPC/HTTP or application workload executed',
      'Synthetic elapsed time does not predict production cost',
      'Window bounds output rows, not underlying peer/index/heap work;3s timeout remains the execution guard',
      'Commit total ledger remains operator-controlled; marker is not human authorization',
      'No postcommit restoration or physical space recovery demonstrated'],
  };
  writeFileSync(path.join(report, 'evidencia-local.json'), JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ status: evidence.status, cases: cases.length,
    committedDeletedRows: prior, clusterStopped: true }, null, 2) + '\n');
} finally {
  if (activeHolder?.child.exitCode === null) {
    activeHolder.child.kill();
    await Promise.allSettled([activeHolder.done]);
  }
  if (started && !stopped) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
}
