import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupPriceHistory, type PriceHistoryCleanupResult } from './price-history-maintenance';
import {
  getPriceHistoryRetentionIntervals,
  PRICE_HISTORY_RETENTION_POLICY,
} from './price-history-retention-policy';

const { rpcMock, serviceClientMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  serviceClientMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: serviceClientMock,
}));

function cleanupReceipt(): PriceHistoryCleanupResult {
  return {
    deletedRows: 20,
    beforeRows: 100,
    remainingRows: 80,
    policy: { keepRawDays: 14, keepHourlyDays: 90, keepDailyDays: 365 },
    executedAt: '2026-10-07T15:30:42.123456+00:00',
  };
}

const rowCountFields = ['deletedRows', 'beforeRows', 'remainingRows'] as const;
const policyFields = ['keepRawDays', 'keepHourlyDays', 'keepDailyDays'] as const;
const invalidNumbers = [null, undefined, -1, 1.5, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER + 1, '', ' ', '20', true, false];

describe('price history maintenance', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    serviceClientMock.mockReset();
    serviceClientMock.mockReturnValue({ rpc: rpcMock });
  });

  it('exposes explicit retention intervals for the cleanup RPC', () => {
    expect(PRICE_HISTORY_RETENTION_POLICY).toEqual({
      keepRawDays: 14,
      keepHourlyDays: 90,
      keepDailyDays: 365,
    });

    expect(getPriceHistoryRetentionIntervals()).toEqual({
      retain_recent: '14 days',
      retain_hourly: '90 days',
      retain_daily: '365 days',
    });
  });

  it('preserves a complete receipt and sends the matching retention intervals', async () => {
    const receipt = cleanupReceipt();
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).resolves.toEqual(receipt);
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith('cleanup_price_history', {
      retain_recent: '14 days', retain_hourly: '90 days', retain_daily: '365 days',
    });
  });

  it('accepts explicitly reported zero rows without replacing the execution date', async () => {
    const receipt = { ...cleanupReceipt(), deletedRows: 0, beforeRows: 0, remainingRows: 0 };
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).resolves.toEqual(receipt);
  });

  it('accepts independent counts when concurrent inserts affect the remaining rows', async () => {
    const receipt = { ...cleanupReceipt(), remainingRows: 105 };
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).resolves.toEqual(receipt);
  });

  it('accepts row counts through the safe integer boundary', async () => {
    const receipt = { ...cleanupReceipt(), beforeRows: Number.MAX_SAFE_INTEGER };
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).resolves.toEqual(receipt);
  });

  it.each(rowCountFields)('rejects an absent %s instead of reporting zero', async (field) => {
    const receipt: Partial<PriceHistoryCleanupResult> = cleanupReceipt();
    delete receipt[field];
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
  });

  it.each(rowCountFields)('rejects invalid or coerced numbers for %s', async (field) => {
    for (const value of invalidNumbers) {
      rpcMock.mockResolvedValue({ data: { ...cleanupReceipt(), [field]: value }, error: null });

      await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
    }
  });

  it('rejects an absent policy instead of reporting the requested policy', async () => {
    const receipt: Partial<PriceHistoryCleanupResult> = cleanupReceipt();
    delete receipt.policy;
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
  });

  it.each([null, [], false, '14/90/365'])('rejects malformed policy %j', async (policy) => {
    rpcMock.mockResolvedValue({ data: { ...cleanupReceipt(), policy }, error: null });

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
  });

  it.each(policyFields)('rejects an absent policy field %s', async (field) => {
    const receipt = cleanupReceipt();
    const policy: Partial<PriceHistoryCleanupResult['policy']> = { ...receipt.policy };
    delete policy[field];
    rpcMock.mockResolvedValue({ data: { ...receipt, policy }, error: null });

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
  });

  it.each(policyFields)('rejects a different or invalid policy field %s', async (field) => {
    for (const value of [...invalidNumbers, PRICE_HISTORY_RETENTION_POLICY[field] + 1,
      String(PRICE_HISTORY_RETENTION_POLICY[field])]) {
      const receipt = cleanupReceipt();
      rpcMock.mockResolvedValue({
        data: { ...receipt, policy: { ...receipt.policy, [field]: value } }, error: null,
      });

      await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
    }
  });

  it('rejects an absent execution date instead of creating a local date', async () => {
    const receipt: Partial<PriceHistoryCleanupResult> = cleanupReceipt();
    delete receipt.executedAt;
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
  });

  it.each([
    '2026-10-07T15:30:42Z',
    '2026-10-07T15:30:42.123Z',
    '2026-10-07T15:30:42.123456+00:00',
    '2026-10-07T12:30:42.123456-03:00',
    '2026-10-07T21:00:42+05:30',
    '2024-02-29T23:59:59Z',
    '2000-02-29T00:00:00Z',
  ])('preserves a complete calendar-valid execution timestamp %s', async (executedAt) => {
    const receipt = { ...cleanupReceipt(), executedAt };
    rpcMock.mockResolvedValue({ data: receipt, error: null });

    await expect(cleanupPriceHistory()).resolves.toEqual(receipt);
  });

  it.each([
    null, undefined, '', ' ', 'invalid-date', 0, true, '0',
    '2026-10-07',
    '2026-10-07T15:30:42',
    '2026-10-07T15:30Z',
    '2026-10-07T15:30:42+0000',
    '2026-00-07T15:30:42Z',
    '2026-13-07T15:30:42Z',
    '2026-10-00T15:30:42Z',
    '2026-10-32T15:30:42Z',
    '2026-02-30T15:30:42Z',
    '2026-02-29T15:30:42Z',
    '2100-02-29T15:30:42Z',
    '2026-04-31T15:30:42.123456-03:00',
    '2026-10-07T24:00:00Z',
    '2026-10-07T15:60:00Z',
    '2026-10-07T15:30:60Z',
    '2026-10-07T15:30:42+24:00',
    '2026-10-07T15:30:42+00:60',
    '2026-10-07T15:30:42Z ',
  ])(
    'rejects invalid execution date %j', async (executedAt) => {
      rpcMock.mockResolvedValue({ data: { ...cleanupReceipt(), executedAt }, error: null });

      await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
    },
  );

  it.each([null, undefined, [], false, 0, 'receipt'])('rejects malformed receipt %j', async (data) => {
    rpcMock.mockResolvedValue({ data, error: null });

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: invalid cleanup response');
  });

  it('preserves the RPC error even if a receipt is present', async () => {
    rpcMock.mockResolvedValue({ data: cleanupReceipt(), error: { message: 'statement timeout' } });

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: statement timeout');
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the unavailable service client error', async () => {
    serviceClientMock.mockReturnValue(null);

    await expect(cleanupPriceHistory()).rejects.toThrow('cleanupPriceHistory: Supabase service client unavailable');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
