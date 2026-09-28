import { describe, expect, it } from 'vitest';
import { canPreviewEditorialAd } from './editorial-pilot';

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
