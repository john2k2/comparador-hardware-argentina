import { ENEBA_AFFILIATE_ID, ENEBA_REVIEWED_GAMES, readEnebaSnapshot, type EnebaSnapshot } from '@/lib/eneba/pilot';

// Sólo datos sintéticos del servidor E2E. Nunca se escriben en la caché real.
// Se conservan las fichas y sus revisiones exactas, incluidas sus expiraciones.
const observedAt = new Date().toISOString();
const snapshot: EnebaSnapshot = {
  status: 'ready', fetchedAt: observedAt, feedUpdatedAt: observedAt,
  offers: ENEBA_REVIEWED_GAMES.map((game, index) => ({
    ...game, price: 1000 + index, currency: 'ARS', observedAt,
    url: `https://www.eneba.com/latam/${game.id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS`,
  })),
};

export function getStableEnebaSnapshot(): EnebaSnapshot {
  return readEnebaSnapshot(snapshot) ?? { status: 'error', offers: [], fetchedAt: null, feedUpdatedAt: null };
}
