import { describe, expect, it } from 'vitest';
import { buildCoreStoreCategoryUrls } from './products-list-targets';

describe('buildCoreStoreCategoryUrls', () => {
  it('nunca usa URLs de procesadores para RAM', () => {
    const urls = Object.values(buildCoreStoreCategoryUrls('memoria-ram'));

    expect(urls.every((url) => !/procesador|microprocesador/i.test(url))).toBe(true);
    expect(urls.every((url) => /ram/i.test(decodeURIComponent(url)))).toBe(true);
  });

  it('usa búsquedas específicas para almacenamiento y refrigeración', () => {
    const storage = Object.values(buildCoreStoreCategoryUrls('almacenamiento'));
    const cooling = Object.values(buildCoreStoreCategoryUrls('refrigeracion'));

    expect(storage.every((url) => /ssd/i.test(decodeURIComponent(url)))).toBe(true);
    expect(cooling.every((url) => /cooler/i.test(decodeURIComponent(url)))).toBe(true);
  });
});
