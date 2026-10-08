import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { privateRoot,validateOutput,selectMigrations,runContracts,suiteNames,carryForwardOracle } from './catalog-restructure-contracts.mjs';

// El laboratorio sólo usa el PG17 de Homebrew; los runners Linux de CI no lo tienen.
const localPg17 = existsSync('/opt/homebrew/opt/postgresql@17/bin/initdb') || 'PG17 local de Homebrew no disponible';

test('replay uses ordered repository migrations and excludes unrelated private dashboard/retention',async()=>{
  const names=await fs.readdir(new URL('../../supabase/migrations/',import.meta.url));
  const selected=selectMigrations(names.reverse());
  assert.deepEqual(selected,[...selected].sort());
  assert.equal(selected.includes('20261006002340_private_measurement_dashboard.sql'),false);
  assert.equal(selected.includes('20261007215027_backed_telemetry_retention.sql'),false);
  assert.equal(suiteNames.length,4);
});

test('output cannot address remote targets, other directories or overwrite input samples',async()=>{
  await assert.rejects(validateOutput('postgres://remote/db'),/CONTRACT_OUTPUT_SCOPE/);
  await assert.rejects(validateOutput('/tmp/contracts-out.json'),/CONTRACT_OUTPUT_SCOPE/);
  await assert.rejects(validateOutput(path.join(privateRoot,'metadata.json')),/CONTRACT_OUTPUT_NAME/);
  assert.equal(/persist_.*offer\(/.test(carryForwardOracle),false,'Oracle fixtures never use observation RPCs');
});

test('SQL current contracts survive local compaction with numeric carry-forward and exact definitions/data', {timeout:180000,skip:localPg17 !== true && localPg17},async()=>{
  await fs.mkdir(privateRoot,{recursive:true,mode:0o700});
  const output=path.join(privateRoot,`contracts-test-${randomUUID()}.json`);
  try {
    const receipt=await runContracts(output);
    assert.equal(receipt.success,true);assert.equal(receipt.noTcp,true);assert.equal(receipt.syntheticOnly,true);
    assert.equal(receipt.projectEnvironmentRead,false);assert.equal(receipt.restorationViaObservationRpc,false);
    assert.equal(receipt.checksPassed,12);assert.equal(receipt.phases.length,2);assert.equal(receipt.compacted.length,4);
    assert.equal(receipt.phases[0].schemaSha256,receipt.phases[1].schemaSha256);
    assert.equal(receipt.clusterStopped,true);assert.equal(receipt.temporaryRemoved,true);
    assert.equal((await fs.stat(output)).mode&0o077,0);
    await assert.rejects(runContracts(output),{code:'EEXIST'});
  } finally {await fs.rm(output,{force:true});}
});
