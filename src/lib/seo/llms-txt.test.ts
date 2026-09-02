import { describe, expect, it } from 'vitest';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';
import { buildLlmsTxt } from './llms-txt';

describe('buildLlmsTxt', () => {
  it('lista páginas públicas y landings de categoría', () => {
    const body = buildLlmsTxt();

    expect(body.startsWith(`# ${SITE_NAME}`)).toBe(true);
    expect(body).toContain('No vende productos');
    expect(body).toContain(`${SITE_URL}/acerca`);
    expect(body).toContain(`${SITE_URL}/guia`);
    expect(body).toContain(`${SITE_URL}/comparativa`);
    expect(body).toContain(`${SITE_URL}/search?category=procesadores`);
    expect(body).toContain(`${SITE_URL}/search?category=tarjetas-graficas`);
  });
});
