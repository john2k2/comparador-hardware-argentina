import { describe, expect, it } from 'vitest';
import { ENEBA_BLACK_FRIDAY, ENEBA_BLACK_FRIDAY_URL, isEnebaBlackFridayActive } from './black-friday';

describe('promoción Black Friday de Eneba', () => {
  it('se muestra sólo antes del vencimiento y nunca sin reloj del navegador', () => {
    const end = Date.parse(ENEBA_BLACK_FRIDAY.endsAt);
    expect(isEnebaBlackFridayActive(Date.parse('2026-11-27T15:00:00Z'))).toBe(true);
    expect(isEnebaBlackFridayActive(end - 1)).toBe(true);
    expect(isEnebaBlackFridayActive(end)).toBe(false);
    expect(isEnebaBlackFridayActive(0)).toBe(false);
    expect(isEnebaBlackFridayActive(Number.NaN)).toBe(false);
  });

  it('el enlace conserva el identificador de afiliado', () => {
    const url = new URL(ENEBA_BLACK_FRIDAY_URL);
    expect(url.hostname).toBe('www.eneba.com');
    expect(url.searchParams.get('af_id')).toBe('Comparador_Hardware_Argentina');
  });
});
