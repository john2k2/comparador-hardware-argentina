import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// La referencia procede de la migración anterior, no de la implementación
// nueva. El helper nunca acepta una base remota ni un nombre de producción.
if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST) ||
  !/^catalog[_-]/.test(process.env.PGDATABASE ?? '')) {
  throw new Error('Estas regresiones escriben fixtures: exigir PostgreSQL LOCAL catalog_*');
}
function execute(sql) {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', timeout: 60000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) throw result.error ?? new Error(`Regresión SQL falló (${result.status})`);
}
const migration = readFileSync(new URL('../supabase/migrations/20261002155711_activate_current_catalog_reads.sql', import.meta.url), 'utf8');
const baseline = migration.slice(migration.indexOf('create or replace function public.search_catalog_page('),
  migration.indexOf('\n\ncommit;')).replace('public.search_catalog_page(', 'public.search_catalog_page_baseline(');
execute(baseline);
try {
  execute(readFileSync(new URL('../supabase/tests/current_catalog_price_fastpath.sql', import.meta.url), 'utf8'));
} finally {
  execute('drop function public.search_catalog_page_baseline(text,text,text[],numeric,numeric,text,integer,integer);');
}
