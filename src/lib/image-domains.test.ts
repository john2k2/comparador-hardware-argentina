import { describe, expect, it } from 'vitest';
import { buildCspImgSrc, buildRemotePatterns } from './image-domains';
import { isImageHostWhitelisted } from './whitelisted-hosts';

describe('image-domains', () => {
  it.each(['imagenes.compragamer.com', 'www.venex.com.ar', 'www.maximus.com.ar'])
  ('permite las fotos directas de %s en el CSP y en la validación', (hostname) => {
    expect(buildCspImgSrc().split(' ')).toContain(`https://${hostname}`);
    expect(isImageHostWhitelisted(`https://${hostname}/photo.jpg`)).toBe(true);
    expect(isImageHostWhitelisted(`https://${hostname}.example.org/photo.jpg`)).toBe(false);
  });

  it('permite la variante www de MaxTecno observada en producción', () => {
    expect(buildRemotePatterns()).toContainEqual(expect.objectContaining({
      hostname: 'www.maxtecno.com.ar',
    }));
  });
});
