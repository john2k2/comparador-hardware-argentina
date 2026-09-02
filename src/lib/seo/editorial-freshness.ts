export const EDITORIAL_UPDATED_AT = '2026-09-02';

export function toIsoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function editorialUpdatedLabel(isoDate: string = EDITORIAL_UPDATED_AT): string {
  return `Actualizado: ${isoDate}`;
}
