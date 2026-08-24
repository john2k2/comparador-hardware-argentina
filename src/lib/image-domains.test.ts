import { describe, expect, it } from 'vitest';
import { buildRemotePatterns } from './image-domains';

describe('image-domains', () => {
  it('permite la variante www de MaxTecno observada en producción', () => {
    expect(buildRemotePatterns()).toContainEqual(expect.objectContaining({
      hostname: 'www.maxtecno.com.ar',
    }));
  });
});
