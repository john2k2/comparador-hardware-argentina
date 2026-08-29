import { describe, expect, it } from 'vitest';
import { formatSyncTimestamp } from './sync-timestamp';

describe('formatSyncTimestamp', () => {
  it('formatea en hora de Argentina sin depender del locale del server', () => {
    const utcAfternoon = Date.UTC(2026, 7, 29, 18, 0, 0);

    expect(formatSyncTimestamp(utcAfternoon)).toBe('29/08 15:00');
  });

  it('marca timestamps vacios como N/D', () => {
    expect(formatSyncTimestamp(0)).toBe('N/D');
  });
});
