import { describe, expect, it, vi } from 'vitest';
import { getEditorialReviewDate, getLatestEditorialReviewDate } from './editorial-dates';

vi.mock('./editorial-methodology', () => ({
  getEditorialMethodology: (slug: string) => ({
    reviewed: { updatedAt: '2026-10-09' },
    previous: { updatedAt: '2026-09-27' },
    'ddr5-vs-ddr4': { updatedAt: '2026-10-10' },
  } as Record<string, { updatedAt: string }>)[slug] ?? null,
}));

describe('fechas de revisión editorial', () => {
  it('la revisión nueva no cambia la fecha de otros artículos ni usa la fecha de ejecución', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2029-05-01T12:00:00Z'));
    try {
      expect(getEditorialReviewDate('reviewed')).toBe('2026-10-09');
      expect(getEditorialReviewDate('previous')).toBe('2026-09-27');
      expect(getEditorialReviewDate('legacy')).toBe('2026-09-02');
      expect(getEditorialReviewDate('ddr5-vs-ddr4')).toBe('2026-10-10');
      expect(getLatestEditorialReviewDate(['previous', 'reviewed', 'legacy'])).toBe('2026-10-09');
    } finally {
      vi.useRealTimers();
    }
  });
});
