export function freshnessLabel(timestamp: number, nowMs = Date.now()): string {
  const ageHours = Math.max(0, Math.floor((nowMs - timestamp) / 3_600_000));
  if (!Number.isFinite(ageHours) || timestamp <= 0) return 'ACTUALIZACION NO DISPONIBLE';
  if (ageHours < 1) return 'ACTUALIZADO HACE MENOS DE 1 HORA';
  if (ageHours < 24) return `ACTUALIZADO HACE ${ageHours} H`;
  return `ACTUALIZADO HACE ${Math.floor(ageHours / 24)} D`;
}
