// Laboratorio físico local: no usa red, configuración del proyecto ni credenciales.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const sourceFile = path.join(root, 'tmp/restructuracion-2026-10-08/input.json');
const outputParent = path.join(root, 'tmp/drenaje-telemetria-2026-10-08');
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const referenceAt = '2026-10-08T19:46:54.059844Z';
const fields = ['id', 'product_id', 'store_id', 'price', 'original_price', 'stock', 'recorded_at', 'offer_url'];
const stocks = ['in-stock', 'low-stock', 'out-of-stock', 'unknown'];
const sha = value => createHash('sha256').update(value).digest('hex');
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const uuid = i => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
const synthetic = Array.from({ length: 768 }, (_, i) => ({
  id: uuid(i + 1), product_id: `edge-product-${i % 4}`, store_id: `edge-store-${i % 2}`,
  price: ['0.00', '0.01', '999999999999.99', '123456789012.34'][i % 4],
  original_price: [null, '-999999999999.99', '0.01'][i % 3], stock: stocks[i % 4],
  recorded_at: ['2025-08-31T00:30:00.123456Z', '2026-03-31T23:59:59.999999Z',
    '2026-04-01T00:30:00.000001Z', '2026-04-01T05:00:00.654321Z', '2026-10-08T19:46:54.000001Z'][i % 5],
  offer_url: [null, '', "https://example.invalid/a,b?quote='x'\nnext", 'https://example.invalid/variant-b'][Math.floor(i / 4) % 4],
}));

const schemaSql = s => `CREATE SCHEMA ${s}; SET search_path=${s},pg_catalog;
  CREATE TABLE products(id text PRIMARY KEY); CREATE TABLE stores(id text PRIMARY KEY);
  CREATE TABLE typed(id uuid PRIMARY KEY, product_id text NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
    store_id text NOT NULL REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    price numeric(14,2) NOT NULL CHECK(price>=0),original_price numeric(14,2),
    stock text NOT NULL CHECK(stock IN('in-stock','low-stock','out-of-stock','unknown')),recorded_at timestamptz NOT NULL,offer_url text);
  CREATE TABLE packed(pack_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id text NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
    store_id text NOT NULL REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT,offer_url text,
    month date NOT NULL,part integer NOT NULL,observations jsonb NOT NULL,
    CHECK(jsonb_typeof(observations)='array' AND jsonb_array_length(observations) BETWEEN 1 AND 256),
    CHECK(octet_length(observations::text)<=1048576),UNIQUE NULLS NOT DISTINCT(product_id,store_id,offer_url,month,part));
  CREATE TABLE row_ids(id uuid PRIMARY KEY,pack_id bigint NOT NULL REFERENCES packed(pack_id) ON UPDATE CASCADE ON DELETE CASCADE,
    ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 256),UNIQUE(pack_id,ordinal));
  CREATE VIEW unpacked AS SELECT (o.value->>0)::uuid AS id,p.product_id,p.store_id,
    (o.value->>1)::numeric(14,2) AS price,(o.value->>2)::numeric(14,2) AS original_price,o.value->>3 AS stock,
    (o.value->>4)::timestamptz AS recorded_at,p.offer_url FROM packed p CROSS JOIN LATERAL jsonb_array_elements(p.observations) o(value);
  CREATE TABLE restored(LIKE typed INCLUDING ALL);
  ALTER TABLE restored ADD FOREIGN KEY(product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
    ADD FOREIGN KEY(store_id) REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  CREATE INDEX typed_offer_lookup ON typed(product_id,store_id,offer_url,recorded_at DESC);`;

const packSql = `BEGIN;WITH numbered AS (SELECT *,date_trunc('month',recorded_at AT TIME ZONE 'UTC')::date AS month,
    ((row_number() OVER(PARTITION BY product_id,store_id,offer_url,date_trunc('month',recorded_at AT TIME ZONE 'UTC')
      ORDER BY recorded_at,id)-1)/256)::integer AS part FROM typed)
  INSERT INTO packed(product_id,store_id,offer_url,month,part,observations)
  SELECT product_id,store_id,offer_url,month,part,jsonb_agg(jsonb_build_array(id::text,price::text,original_price::text,stock,
    to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY recorded_at,id)
  FROM numbered GROUP BY product_id,store_id,offer_url,month,part;
  INSERT INTO row_ids SELECT (o.value->>0)::uuid,p.pack_id,o.ordinal::integer
    FROM packed p CROSS JOIN LATERAL jsonb_array_elements(p.observations) WITH ORDINALITY o(value,ordinal);COMMIT;`;

const equalitySql = (a, b) => `SELECT jsonb_build_object('leftOnly',(SELECT count(*) FROM (SELECT * FROM ${a} EXCEPT ALL SELECT * FROM ${b}) t),
  'rightOnly',(SELECT count(*) FROM (SELECT * FROM ${b} EXCEPT ALL SELECT * FROM ${a}) t),
  'leftRows',(SELECT count(*) FROM ${a}),'rightRows',(SELECT count(*) FROM ${b}),
  'distinctIds',(SELECT count(DISTINCT id) FROM ${b}));`;
const collisionGuard = `DO $$ BEGIN IF EXISTS(SELECT 1 FROM unpacked u JOIN restored r USING(id)
    WHERE row(u.product_id,u.store_id,u.price,u.original_price,u.stock,u.recorded_at,u.offer_url)
      IS DISTINCT FROM row(r.product_id,r.store_id,r.price,r.original_price,r.stock,r.recorded_at,r.offer_url))
    THEN RAISE EXCEPTION 'COLD_RESTORE_ID_VALUE_COLLISION'; END IF; END $$;`;
const restoreSql = `BEGIN;${collisionGuard}
  INSERT INTO restored SELECT * FROM unpacked ON CONFLICT(id) DO NOTHING; COMMIT;`;

export async function runHistoryColdLab() {
  const startedAt = new Date().toISOString(), started = performance.now(), cpuStart = process.cpuUsage();
  assert.ok((await fs.stat(sourceFile)).size <= 32 * 1024 ** 2, 'COLD_SOURCE_BYTE_BUDGET');
  const inputBytes = await fs.readFile(sourceFile), input = JSON.parse(inputBytes);
  const rows = input.samples?.price_history;
  assert.equal(rows?.length, 5000, 'COLD_SAMPLE_ROWS');
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [...fields].sort(), 'COLD_SAMPLE_FIELDS');
    assert.match(row.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i, 'COLD_SAMPLE_UUID');
    assert.ok(stocks.includes(row.stock), 'COLD_SAMPLE_STOCK');
    assert.ok(typeof row.recorded_at === 'string', 'COLD_SAMPLE_TIMESTAMP');
  }
  await fs.mkdir(outputParent, { recursive: true, mode: 0o700 });
  assert.equal(await fs.realpath(outputParent), outputParent, 'COLD_OUTPUT_PARENT_SYMLINK');
  const output = await fs.mkdtemp(path.join(outputParent, 'cold-lab-')); await fs.chmod(output, 0o700);
  let local, mayBeRunning = false, receipt, stage = 'initialization';
  const run = (binary, args, sql) => {
    try { return execFileSync(pg + binary, args, { input: sql, encoding: 'utf8', env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 8 * 1024 ** 2 }); }
    catch (error) { const fail = new Error('COLD_LOCAL_PROCESS_FAILED');
      fail.diagnostic = String(error.stderr ?? error.message).slice(0, 2000); throw fail; }
  };
  try {
    local = await fs.mkdtemp('/tmp/comparador-cold-'); await fs.chmod(local, 0o700);
    const data = path.join(local, 'data'), socket = path.join(local, 's'); await fs.mkdir(socket, { mode: 0o700 });
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    mayBeRunning = true;
    run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o',
      `-h '' -k ${socket} -p 55492 -c cluster_name=history-cold-local`, '-w', 'start']);
    run('createdb', ['-h', socket, '-p', '55492', '-U', 'postgres', 'cold_local']);
    const connection = ['-X', '-h', socket, '-p', '55492', '-U', 'postgres', '-d', 'cold_local', '-v', 'ON_ERROR_STOP=1', '-Atq'];
    const query = sql => run('psql', connection, `SET statement_timeout='30s'; SET TIME ZONE 'UTC'; ${sql}`).trim();
    assert.equal(query('SHOW data_directory;'), data, 'COLD_CLUSTER_DIRECTORY');
    assert.equal(query('SHOW listen_addresses;'), '', 'COLD_NO_TCP');
    assert.equal(query('SHOW cluster_name;'), 'history-cold-local', 'COLD_CLUSTER_IDENTITY');
    const version = query('SHOW server_version;'); assert.match(version, /^17\./, 'COLD_PG_VERSION');
    const use = (s, sql) => query(`SET search_path=${s},pg_catalog; ${sql}`);
    const load = (s, payload, coldOnly = false) => {
      query(schemaSql(s));
      const recordset = `jsonb_to_recordset(${literal(JSON.stringify(payload))}::jsonb)
        AS r(id uuid,product_id text,store_id text,price numeric(14,2),original_price numeric(14,2),stock text,recorded_at timestamptz,offer_url text)`;
      use(s, `INSERT INTO products SELECT DISTINCT product_id FROM ${recordset}; INSERT INTO stores SELECT DISTINCT store_id FROM ${recordset};
        INSERT INTO typed SELECT * FROM ${recordset}${coldOnly ? ` WHERE recorded_at < ${literal(referenceAt)}::timestamptz-interval '90 days'` : ''};`);
    };
    const sizes = (s, name) => JSON.parse(use(s, `SELECT jsonb_build_object('heapBytes',pg_relation_size('${name}'),
      'tableBytes',pg_table_size('${name}'),'indexBytes',pg_indexes_size('${name}'),'totalBytes',pg_total_relation_size('${name}'),
      'toastBytes',coalesce((SELECT pg_total_relation_size(reltoastrelid) FROM pg_class WHERE oid='${name}'::regclass AND reltoastrelid<>0),0),
      'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(indexrelid),'bytes',pg_relation_size(indexrelid)))
        FROM pg_index WHERE indrelid='${name}'::regclass));`));
    const explain = (s, name, sql) => {
      const plans = Array.from({ length: 3 }, () => JSON.parse(use(s, `EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${sql};`))[0]);
      return { name, repetitions: 3, executionMs: plans.map(p => p['Execution Time']), planningMs: plans.map(p => p['Planning Time']),
        firstPlan: plans[0], lastPlan: plans[2] };
    };
    const datasets = [];
    for (const [s, payload, coldOnly] of [['sample', rows, false], ['cold_sample', rows, true], ['edges', synthetic, false]]) {
      stage = s + '/load'; load(s, payload, coldOnly);
      const typedMinimal = sizes(s, 'typed');
      stage = s + '/pack'; const packStart = performance.now(); use(s, packSql); const packWallMs = performance.now() - packStart;
      use(s, 'ANALYZE typed;ANALYZE packed;ANALYZE row_ids;');
      const equality = JSON.parse(use(s, equalitySql('typed', 'unpacked')));
      assert.equal(equality.leftOnly, 0, 'COLD_EXCEPT_LEFT'); assert.equal(equality.rightOnly, 0, 'COLD_EXCEPT_RIGHT');
      assert.equal(equality.leftRows, equality.rightRows, 'COLD_ROW_COUNT'); assert.equal(equality.rightRows, equality.distinctIds, 'COLD_DUPLICATE_ID');
      assert.equal(Number(use(s, 'SELECT count(*) FROM row_ids;')), equality.leftRows, 'COLD_REGISTRY_COUNT');
      stage = s + '/restore'; use(s, restoreSql); use(s, restoreSql);
      const restored = JSON.parse(use(s, equalitySql('typed', 'restored')));
      assert.equal(restored.leftOnly + restored.rightOnly, 0, 'COLD_RESTORE_EQUALITY');
      assert.equal(restored.leftRows, restored.rightRows, 'COLD_RESTORE_IDEMPOTENT');
      // Probar colisión sin destruir fuentes: la inserción fallida queda en subtransacción propia.
      use(s, `DO $$ BEGIN BEGIN INSERT INTO row_ids SELECT * FROM row_ids LIMIT 1;
        RAISE EXCEPTION 'COLD_DUPLICATE_ACCEPTED'; EXCEPTION WHEN unique_violation THEN NULL; END; END $$;`);
      assert.throws(() => use(s, `BEGIN;UPDATE restored SET price=CASE WHEN price=0 THEN 1 ELSE 0 END
        WHERE id=(SELECT id FROM restored ORDER BY id LIMIT 1);${collisionGuard}ROLLBACK;`),
      error => error.diagnostic?.includes('COLD_RESTORE_ID_VALUE_COLLISION'), 'COLD_VALUE_COLLISION_REJECTED');
      assert.equal(JSON.parse(use(s, equalitySql('typed', 'restored'))).rightOnly, 0, 'COLD_COLLISION_ROLLBACK');
      const packed = sizes(s, 'packed'), registry = sizes(s, 'row_ids');
      const grouping = JSON.parse(use(s, `SELECT jsonb_build_object('rows',(SELECT count(*) FROM typed),'packs',count(*),
        'nullUrlPacks',count(*) FILTER(WHERE offer_url IS NULL),'emptyUrlPacks',count(*) FILTER(WHERE offer_url=''),
        'meanRowsPerPack',avg(jsonb_array_length(observations)),'maxRowsPerPack',max(jsonb_array_length(observations)),
        'payloadTextBytes',sum(octet_length(observations::text)),'maxPayloadTextBytes',max(octet_length(observations::text))) FROM packed;`));
      const lookup = `product_id=(SELECT product_id FROM typed ORDER BY id LIMIT 1)
        AND store_id=(SELECT store_id FROM typed ORDER BY id LIMIT 1)
        AND offer_url IS NOT DISTINCT FROM (SELECT offer_url FROM typed ORDER BY id LIMIT 1)`;
      const benchmarks = [explain(s, 'typed-all-eight-fields', 'SELECT * FROM typed'),
        explain(s, 'packed-all-eight-fields', 'SELECT * FROM unpacked'),
        explain(s, 'typed-one-offer', `SELECT * FROM typed WHERE ${lookup}`),
        explain(s, 'packed-one-offer', `SELECT * FROM unpacked WHERE ${lookup}`),
        explain(s, 'typed-one-uuid', 'SELECT * FROM typed WHERE id=(SELECT id FROM typed ORDER BY id LIMIT 1)'),
        explain(s, 'packed-one-uuid-registry', `SELECT r.id,p.product_id,p.store_id,
          (p.observations->(r.ordinal-1)->>1)::numeric(14,2) AS price,
          (p.observations->(r.ordinal-1)->>2)::numeric(14,2) AS original_price,p.observations->(r.ordinal-1)->>3 AS stock,
          (p.observations->(r.ordinal-1)->>4)::timestamptz AS recorded_at,p.offer_url
          FROM row_ids r JOIN packed p USING(pack_id) WHERE r.id=(SELECT id FROM typed ORDER BY id LIMIT 1)`)];
      stage = s + '/full-index-baseline';
      use(s, `CREATE INDEX typed_product_time ON typed(product_id,recorded_at DESC);
        CREATE INDEX typed_store_time ON typed(store_id,recorded_at DESC);CREATE INDEX typed_time ON typed(recorded_at DESC);
        CREATE INDEX typed_product_store_time ON typed(product_id,store_id,recorded_at DESC);ANALYZE typed;ANALYZE packed;ANALYZE row_ids;`);
      const typedSixIndexes = sizes(s, 'typed');
      benchmarks.push(explain(s, 'typed-six-indexes-one-offer', `SELECT * FROM typed WHERE ${lookup}`));
      datasets.push({ name: s, sampled: s !== 'edges', coldOnly, referenceAt, equality, restored, repeatedRestore: true,
        duplicateRegistryRejected: true, valueCollisionRejectedWithRollback: true, grouping, typedMinimal, typedSixIndexes, packed, registry,
        packedWithRegistryBytes: packed.totalBytes + registry.totalBytes, packWallMs: Math.round(packWallMs), benchmarks });
    }
    stage = 'fixture-contracts';
    use('edges', `DO $$ BEGIN
      IF (SELECT count(DISTINCT recorded_at) FROM unpacked)<>5 THEN RAISE EXCEPTION 'COLD_TIMESTAMP_PRECISION'; END IF;
      IF NOT EXISTS(SELECT 1 FROM unpacked WHERE original_price=-999999999999.99 AND price=999999999999.99)
        THEN RAISE EXCEPTION 'COLD_DECIMAL_LIMIT'; END IF;
      IF NOT EXISTS(SELECT 1 FROM packed WHERE offer_url IS NULL) OR NOT EXISTS(SELECT 1 FROM packed WHERE offer_url='')
        THEN RAISE EXCEPTION 'COLD_URL_NULL_EMPTY'; END IF;
      BEGIN INSERT INTO packed(product_id,store_id,offer_url,month,part,observations)
        VALUES('missing-product','edge-store-0',NULL,'2026-01-01',0,'[["id"]]');
        RAISE EXCEPTION 'COLD_FK_ACCEPTED';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
    END $$;`);
    use('edges', `BEGIN;UPDATE products SET id=id||'-moved' WHERE id='edge-product-0';
      UPDATE stores SET id=id||'-moved' WHERE id='edge-store-0';
      DO $$ BEGIN IF EXISTS((SELECT * FROM typed EXCEPT ALL SELECT * FROM unpacked)
        UNION ALL (SELECT * FROM unpacked EXCEPT ALL SELECT * FROM typed))
        OR EXISTS((SELECT * FROM restored EXCEPT ALL SELECT * FROM unpacked)
        UNION ALL (SELECT * FROM unpacked EXCEPT ALL SELECT * FROM restored))
        THEN RAISE EXCEPTION 'COLD_PARENT_UPDATE_CASCADE';END IF;END $$;ROLLBACK;`);
    use('edges', `DO $$ BEGIN BEGIN DELETE FROM stores WHERE id='edge-store-0';
      RAISE EXCEPTION 'COLD_STORE_DELETE_ACCEPTED';EXCEPTION WHEN foreign_key_violation THEN NULL;END;END $$;
      BEGIN;DELETE FROM products WHERE id='edge-product-0';
      DO $$ BEGIN IF (SELECT count(*) FROM typed)<>(SELECT count(*) FROM unpacked)
        OR (SELECT count(*) FROM restored)<>(SELECT count(*) FROM unpacked)
        OR (SELECT count(*) FROM row_ids)<>(SELECT count(*) FROM unpacked)
        THEN RAISE EXCEPTION 'COLD_PRODUCT_DELETE_CASCADE';END IF;END $$;ROLLBACK;`);
    stage = 'stop';
    receipt = { success: true, startedAt, postgresVersion: version, localOnly: true, noTcp: true,
      projectEnvironmentRead: false, remoteQueries: 0, productionWrites: 0, rpcParityProven: false,
      source: { path: path.relative(root, sourceFile), sha256: sha(inputBytes), capturedAt: input.capturedAt,
        sourceCommit: input.sourceCommit, sampleRows: rows.length, independentCsv: false,
        representativeness: input.representativeness, numericJsonInputPrecisionNotIndependentlyVerified: true },
      layout: { maxRowsPerPack: 256, maxPayloadTextBytes: 1048576, monthTimezone: 'UTC',
        identity: 'product_id/store_id/NULL-distinct-offer_url/month/part',
        observationFields: ['id', 'price-text', 'original-price-text-or-null', 'stock', 'UTC-six-decimal-timestamp'],
        registry: 'UUID PK plus unique(pack_id,ordinal); cold-only registry, not global hot/cold enforcement' },
      datasets, syntheticExactPrecisionProven: true, foreignKeys: { missingParentRejected: true,
        parentUpdatesCascade: true, storeDeletionRestricted: true, productDeletionCascadesIncludingRegistry: true },
      limits: ['Sample JSON round-trip is not an independent production NUMERIC/microsecond validation.',
        'No sample representativeness or whole-population savings proven; minimal-index baseline must also be compared.',
        'Fresh empty local relations are not a measurement of production bloat, reclamation, WAL or migration peak.',
        'No 7/90/365 RPC parity, dynamic-cohort query, hot/cold global uniqueness or production restore implemented.',
        'Timing uses three local warmable queries; SQL execution excludes network and does not isolate PostgreSQL CPU/memory.',
        'Registry enforces IDs among packed rows only; restore prototype compares values before idempotent insertion.',
        'FK existence/update/delete tested locally; full application writer/consumer compatibility remains open.'],
      scriptSha256: sha(await fs.readFile(import.meta.filename)) };
  } catch (error) {
    receipt = { success: false, localOnly: true, startedAt, stage, reason: error.message, diagnostic: error.diagnostic ?? null };
  } finally {
    let clusterStopped = !mayBeRunning;
    if (mayBeRunning) {
      try {
        let running = true;
        try { execFileSync(pg + 'pg_ctl', ['-D', path.join(local, 'data'), 'status'], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 }); }
        catch (error) { if (error.status === 3) running = false; else throw error; }
        if (running) run('pg_ctl', ['-D', path.join(local, 'data'), '-m', 'fast', '-w', 'stop']);
        clusterStopped = true;
      } catch { clusterStopped = false; receipt.success = false; receipt.cleanupError = 'COLD_OWN_CLUSTER_STOP_FAILED'; }
    }
    if (local && clusterStopped) await fs.rm(local, { recursive: true, force: true });
    receipt.clusterStopped = clusterStopped; receipt.clusterDirectoryRemoved = Boolean(local && clusterStopped);
    receipt.completedAt = new Date().toISOString(); receipt.wallMs = Math.round(performance.now() - started);
    receipt.nodeCpuMicros = process.cpuUsage(cpuStart); receipt.nodeMemoryAfterLab = process.memoryUsage();
    await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  assert.equal(receipt.success, true, 'COLD_LAB_OR_CLEANUP_FAILED');
  return { output: path.relative(root, output), success: receipt.success, clusterStopped: receipt.clusterStopped,
    datasets: receipt.datasets.map(d => ({ name: d.name, rows: d.equality.leftRows, packs: d.grouping.packs,
      typedMinimalBytes: d.typedMinimal.totalBytes, typedSixIndexesBytes: d.typedSixIndexes.totalBytes,
      packedBytes: d.packed.totalBytes, registryBytes: d.registry.totalBytes, packedWithRegistryBytes: d.packedWithRegistryBytes })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runHistoryColdLab().then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
