export const BUILDER_BUDGET_MIN = 400_000;
export const BUILDER_BUDGET_MAX = 20_000_000;

export function parseBuilderBudgetPesos(
  raw: string | string[] | undefined,
): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;

  const digits = value.replace(/\D/g, '');
  if (!digits) return null;

  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount < BUILDER_BUDGET_MIN || amount > BUILDER_BUDGET_MAX) {
    return null;
  }

  return Math.round(amount);
}
