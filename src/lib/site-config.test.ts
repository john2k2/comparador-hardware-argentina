import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('buildMailtoHref', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPPORT_EMAIL', 'contacto@comparador-hardware.com.ar');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('codifica espacios del asunto como %20 para clientes de correo', async () => {
    const { buildMailtoHref } = await import('./site-config');

    expect(buildMailtoHref('Comparador Hardware Argentina - Consulta')).toBe(
      'mailto:contacto@comparador-hardware.com.ar?subject=Comparador%20Hardware%20Argentina%20-%20Consulta',
    );
  });
});
