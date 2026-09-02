import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260902140000_hardware_price_index_rpc_fast.sql');

describe('hardware price index RPC migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('reconstructs event history by current offer identity and aggregates product medians', () => {
    expect(sql).toContain('generate_series');
    expect(sql).toContain("::date - p_days");
    expect(sql).toContain('product_id');
    expect(sql).toContain('store_id');
    expect(sql).toContain('offer_url');
    expect(sql).toContain('percentile_cont(0.5)');
    expect(sql).toContain("'in-stock', 'low-stock'");
    expect(sql).toContain('lead(quote_day)');
    expect(sql).toContain('greatest(w.quote_day');
    expect(sql).toContain('#variable_conflict use_column');
    expect(sql).not.toContain('cross join lateral (');
  });

  it('is invoker-only and callable exclusively by service_role', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toContain('revoke all on function public.hardware_price_index(integer) from public');
    expect(sql).toContain('revoke all on function public.hardware_price_index(integer) from anon');
    expect(sql).toContain('revoke all on function public.hardware_price_index(integer) from authenticated');
    expect(sql).toContain('grant execute on function public.hardware_price_index(integer) to service_role');
  });
});
