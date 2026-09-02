import { describe, expect, it } from 'vitest';
import { EDITORIAL_UPDATED_AT, editorialUpdatedLabel, toIsoDateOnly } from './editorial-freshness';

describe('editorial freshness', () => {
  it('expone una fecha ISO de revisión editorial', () => {
    expect(EDITORIAL_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(editorialUpdatedLabel()).toBe(`Actualizado: ${EDITORIAL_UPDATED_AT}`);
  });

  it('recorta timestamps a YYYY-MM-DD', () => {
    expect(toIsoDateOnly('2026-06-08T00:00:00.000Z')).toBe('2026-06-08');
    expect(toIsoDateOnly('2026-06-08')).toBe('2026-06-08');
    expect(toIsoDateOnly(null)).toBeNull();
  });
});
