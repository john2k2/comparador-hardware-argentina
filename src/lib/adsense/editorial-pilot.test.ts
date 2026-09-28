import { describe, expect, it } from 'vitest';
import { canBootstrapEditorialAd, canPreviewEditorialAd, getEditorialAdAuthorization, type EditorialAdAuthorization } from './editorial-pilot';

const localPreview = { nodeEnv: 'development', previewRequested: '1', contentReady: true };

describe('maqueta de publicidad editorial', () => {
  it('rechaza producción aunque alguien configure la variable de maqueta', () => {
    expect(canPreviewEditorialAd('/guia/pc-gamer-2-millones', { ...localPreview, nodeEnv: 'production' })).toBe(false);
  });

  it('no amplía el piloto a otras guías, rutas privadas ni coincidencias parciales', () => {
    for (const path of ['/guia/pc-gamer-1-millon', '/guia/armar', '/product/cpu', '/search', '/admin', '/auth', '/contacto', '/comparativa/rtx-4060-vs-rx-7600-extra', '/guia/pc-gamer-2-millones/']) {
      expect(canPreviewEditorialAd(path, localPreview)).toBe(false);
    }
  });

  it('solo permite la maqueta solicitada con contenido disponible en una ruta del piloto', () => {
    expect(canPreviewEditorialAd('/guia/pc-gamer-2-millones', localPreview)).toBe(true);
    expect(canPreviewEditorialAd('/comparativa/rtx-4060-vs-rx-7600', localPreview)).toBe(true);
    expect(canPreviewEditorialAd('/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x', localPreview)).toBe(true);
    expect(canPreviewEditorialAd('/guia/pc-gamer-2-millones', { ...localPreview, contentReady: false })).toBe(false);
    expect(canPreviewEditorialAd('/guia/pc-gamer-2-millones', { ...localPreview, previewRequested: undefined })).toBe(false);
  });
});

describe('autorización del piloto publicitario', () => {
  const path = '/guia/pc-gamer-2-millones';
  const reviewed: EditorialAdAuthorization = {
    enabled: true, googleApproved: true, privacyReviewed: true, navigationReviewed: true,
    autoAdsDisabledVerified: true, editorialApproved: true, contentReady: true,
    cspProfile: 'adsense', nonce: '0123456789abcdef0123456789abcdef',
  };

  it('mantiene cerrado el contexto real aunque tenga contenido y nonce', () => {
    expect(canBootstrapEditorialAd(path, getEditorialAdAuthorization(path, true, 'adsense', reviewed.nonce))).toBe(false);
  });

  it.each(['enabled', 'googleApproved', 'privacyReviewed', 'navigationReviewed', 'autoAdsDisabledVerified', 'editorialApproved', 'contentReady'] as const)(
    'no carga Google cuando falta %s', (gate) => {
      expect(canBootstrapEditorialAd(path, reviewed)).toBe(true);
      expect(canBootstrapEditorialAd(path, { ...reviewed, [gate]: false })).toBe(false);
    },
  );

  it('exige perfil de documento, nonce válido y ruta exacta', () => {
    expect(canBootstrapEditorialAd(path, { ...reviewed, cspProfile: 'site' })).toBe(false);
    for (const nonce of [undefined, '', 'bad-nonce', "0123'; script-src *", `${reviewed.nonce}0`]) {
      expect(canBootstrapEditorialAd(path, { ...reviewed, nonce })).toBe(false);
    }
    for (const otherPath of ['/auth', '/contacto', '/search', '/guia/pc-gamer-1-millon', `${path}/`, `${path}?ads=1`]) {
      expect(canBootstrapEditorialAd(otherPath, reviewed)).toBe(false);
    }
  });
});
