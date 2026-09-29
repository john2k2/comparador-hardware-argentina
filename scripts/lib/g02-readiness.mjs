// Diagnóstico de cierre: nunca modifica backlog ni convierte pruebas manuales en días.
export function evaluateG02Readiness(cycles, freshness, fixedIds, measuredAt = new Date().toISOString()) {
  const now = Date.parse(measuredAt);
  if (!Number.isFinite(now) || !Array.isArray(cycles) || !Array.isArray(fixedIds)
    || fixedIds.length !== 9 || new Set(fixedIds).size !== 9) throw new Error('G02_INVALID_INPUT');
  const count = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
  const runs = new Set(), days = new Set();
  const acceptedRuns = [];
  for (const cycle of cycles) {
    const started = Date.parse(cycle.inicio_ciclo);
    if (cycle.event !== 'schedule' || cycle.ciclo_util !== 'si' || !/^\d+$/.test(cycle.run_id ?? '')
      || !Number.isFinite(started) || started > now || !cycle.fuente
      || !['observaciones', 'productos', 'tiendas_observadas'].every(key => count(cycle[key]))) continue;
    const day = new Date(started).toISOString().slice(0, 10);
    if (runs.has(cycle.run_id) || days.has(day)) continue;
    runs.add(cycle.run_id); days.add(day); acceptedRuns.push({ runId: cycle.run_id, day, source: cycle.fuente });
  }
  const blockers = [];
  if (days.size < 7) blockers.push('fewer-than-seven-useful-daily-cycles');
  const snapshotTime = Date.parse(freshness?.measuredAt);
  const recent = Number.isFinite(snapshotTime) && snapshotTime <= now && now - snapshotTime <= 3 * 3600_000;
  if (!recent) blockers.push('missing-or-stale-freshness-snapshot');
  const sample = freshness?.sample;
  const rows = sample?.byProduct;
  const fixedSampleMatches = Array.isArray(rows) && rows.length === fixedIds.length
    && new Set(rows.map(row => row.productId)).size === fixedIds.length
    && fixedIds.every(id => rows.some(row => row.productId === id));
  if (!fixedSampleMatches) blockers.push('fixed-sample-missing-or-changed');
  const ratio = value => Number.isSafeInteger(value?.denominator) && value.denominator > 0
    && Number.isSafeInteger(value?.fresh24h) && value.fresh24h >= 0 && value.fresh24h <= value.denominator
    ? value.fresh24h / value.denominator : null;
  const globalRatio = ratio(freshness), sampleRatio = ratio(sample);
  if (globalRatio === null || globalRatio < 0.95) blockers.push('global-freshness-below-proposed-95-percent');
  if (sampleRatio === null || sampleRatio < 0.95) blockers.push('sample-freshness-below-proposed-95-percent');
  const covered = fixedSampleMatches ? rows.filter(row => Number.isSafeInteger(row.identityAccepted3h)
    && row.identityAccepted3h > 0 && row.identityAccepted3h <= row.fresh3h).length : null;
  if (covered !== fixedIds.length) blockers.push('fixed-products-without-accepted-recent-offer');
  return { measuredAt, status: blockers.length ? 'not-ready' : 'ready-for-review',
    definition: 'Diagnóstico basado en ciclos documentados como útiles; no revalida artefactos históricos ni autoriza cierre. El 95% sigue siendo la meta propuesta, no una garantía de compra.',
    usefulDailyCycles: days.size, requiredUsefulDailyCycles: 7, acceptedRuns,
    fixedSampleMatches, productsWithAcceptedOffer3h: covered, requiredSampleProducts: fixedIds.length,
    globalFresh24hRatio: globalRatio, sampleFresh24hRatio: sampleRatio, blockers };
}
