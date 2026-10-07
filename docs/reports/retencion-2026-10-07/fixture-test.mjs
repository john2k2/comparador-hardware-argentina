import assert from 'node:assert/strict';
import { execFileSync,spawn } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const binary='/opt/homebrew/opt/postgresql@17/bin/psql';
const args=['-h','127.0.0.1','-p','55483','-U','postgres','-d','retention_local','-X','-At','-q','-v','ON_ERROR_STOP=1'];
const query=sql=>execFileSync(binary,[...args,'-c',sql],{encoding:'utf8',maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const draft=readFileSync('tmp/retencion-2026-10-07/cache-vencida-piloto.sql','utf8');
query(`create role service_role;create role anon;create role authenticated;
create table api_cache_entries(cache_key text primary key,scope text not null,payload jsonb not null,
  expires_at timestamptz not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index api_cache_entries_expires_idx on api_cache_entries(expires_at);
create index api_cache_entries_scope_idx on api_cache_entries(scope);
alter table api_cache_entries enable row level security;
grant select,insert,update,delete on api_cache_entries to service_role,anon,authenticated;
create policy service_all on api_cache_entries to service_role using(true) with check(true);
insert into api_cache_entries(cache_key,scope,payload,expires_at,updated_at)
select 'old-'||g,'operational-store-event','{"synthetic":true}','2026-10-01Z','2026-09-29Z' from generate_series(1,1050)g;
insert into api_cache_entries(cache_key,scope,payload,expires_at,updated_at)
select kind||'-'||g,case kind when 'endpoint' then 'operational-endpoint-event' when 'demand' then 'catalog-refresh-demand'
  when 'unknown' then 'unknown-fixture' else 'operational-store-event' end,'{"synthetic":true}',
  case kind when 'active' then '2026-10-08Z' when 'renewed' then '2026-10-08Z'
    when 'boundary' then '2026-10-07T14:30Z' else '2026-10-01Z' end::timestamptz,
  case kind when 'updated' then '2026-10-07T14:31Z' else '2026-09-29Z' end::timestamptz
from unnest(array['active','renewed','boundary','endpoint','demand','unknown','updated'])kind cross join generate_series(1,10)g;
insert into api_cache_entries values('concurrent-renew','operational-store-event','{"synthetic":true}',
  '2026-10-01Z','2026-09-29Z','2026-09-29Z');`);
assert.throws(()=>query(draft),/CACHE_CLEANUP_REQUIRES_EXPLICIT_APPROVAL/);
assert.equal(query('select count(*) from api_cache_entries;'),'1121');
const approved=draft.replace('BEGIN;',`BEGIN;SET LOCAL app.cache_cleanup_approved='retencion-2026-10-07-pilot-v1';SET LOCAL ROLE service_role;`);
assert.equal(query(approved).split('|').at(-1),'250');
assert.equal(query('select count(*) from api_cache_entries;'),'1121','ROLLBACK default conserva toda la fixture');
assert.equal(query('begin;set local role anon;select count(*) from api_cache_entries;rollback;'),'0','Grants no saltan RLS');
const holder=spawn(binary,[...args,'-c',`begin;update api_cache_entries set expires_at='2026-10-08Z',
  updated_at='2026-10-07T14:31Z' where cache_key='concurrent-renew';select pg_sleep(1);commit;`],
  {env:{...process.env,PGAPPNAME:'retention-local-renewer'},stdio:['ignore','pipe','pipe']});
holder.stdout.resume(); let holderError='';holder.stderr.on('data',chunk=>{holderError+=chunk;});
const done=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('exit',code=>code===0?resolve():reject(new Error(holderError)));});
done.catch(()=>{});
let observed=false;
for(let i=0;i<25;i++) {
  if(query("select exists(select 1 from pg_stat_activity where application_name='retention-local-renewer' and wait_event='PgSleep');")==='t') {observed=true;break;}
  await delay(20);
}
assert.ok(observed,'Se observó renovación concurrente en la instancia propia');
const batches=[];
try {
  for(let i=0;i<4;i++) {
    const started=performance.now();
    const count=Number(query(approved.replace('ROLLBACK;','COMMIT;')).split('|').at(-1));
    assert.equal(count,250);batches.push({batch:i+1,deletedRows:count,clientElapsedMs:Math.round(performance.now()-started)});
  }
  await done;
  assert.equal(query("select count(*) from api_cache_entries where cache_key not like 'old-%';"),'71');
  assert.equal(query("select count(*) from api_cache_entries where cache_key like 'old-%';"),'50');
  assert.equal(query("select expires_at>='2026-10-07T14:30Z' from api_cache_entries where cache_key='concurrent-renew';"),'t');
  const result={finishedAt:new Date().toISOString(),mode:'LOCAL SYNTHETIC ONLY',port:55483,database:'retention_local',
    cases:['approval gate','default rollback','RLS anon denies reads','active preserved','expiry boundary preserved',
      'renewed preserved','updated after cutoff preserved','other scopes preserved','concurrent renewal/lock preserved','four bounded250 commits'],
    beforeRows:1121,deletedRows:1000,afterRows:121,preservedRows:71,remainingEligible:50,batches};
  writeFileSync('tmp/retencion-2026-10-07/prueba-local.json',JSON.stringify(result,null,2));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
} finally {
  if(holder.exitCode===null)holder.kill();
  await Promise.allSettled([done]);
}
