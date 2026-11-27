import { ENEBA_AFFILIATE_ID } from './pilot';

// Promoción enviada por Eneba a afiliados el 27/11/2026: un uso por usuario,
// vigente hasta el domingo a la noche. Se corta antes, a las 20:00 de Argentina,
// para no mostrar un código que Eneba ya podría haber dado de baja.
export const ENEBA_BLACK_FRIDAY = {
  code: 'BFSPREE',
  endsAt: '2026-11-29T23:00:00.000Z',
  discounts: [
    { label: 'Juegos', value: '12%' },
    { label: 'Suscripciones', value: '10%' },
    { label: 'DLC', value: '10%' },
    { label: 'Game points', value: '9%' },
    { label: 'Gift cards', value: '3%' },
    { label: 'Recargas', value: '3%' },
  ],
} as const;

export const ENEBA_BLACK_FRIDAY_URL = `https://www.eneba.com/?af_id=${ENEBA_AFFILIATE_ID}`;

/** `now` en milisegundos; 0 o NaN (sin reloj del navegador todavía) no muestra la promo. */
export function isEnebaBlackFridayActive(now: number): boolean {
  return Number.isFinite(now) && now > 0 && now < Date.parse(ENEBA_BLACK_FRIDAY.endsAt);
}
