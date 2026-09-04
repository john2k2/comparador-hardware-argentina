import { describe, expect, it } from 'vitest';
import { categories } from '@/lib/scrapers/static-data';
import type { HardwareCategory } from '@/lib/types';
import {
  CATEGORY_LANDING_SLUGS,
  CATEGORY_LANDING_BASE_PATH,
  buildCategoryLandingPath,
  resolveLegacyCategoryLandingRedirect,
  listCategoryLandingSlugs,
  resolveCategoryFromLandingSlug,
} from './category-landing-routes';

describe('category landing routes', () => {
  it('cubre todas las categorías del catálogo sin slugs repetidos', () => {
    const slugs = categories.map((category) => CATEGORY_LANDING_SLUGS[category.id]);

    expect(slugs.every(Boolean)).toBe(true);
    expect(new Set(slugs).size).toBe(categories.length);
  });

  it('usa el término de búsqueda real para tarjetas gráficas', () => {
    expect(buildCategoryLandingPath('tarjetas-graficas')).toBe('/comparar/placas-de-video');
  });

  it('construye rutas limpias bajo el prefijo de comparación', () => {
    expect(CATEGORY_LANDING_BASE_PATH).toBe('/comparar');
    expect(buildCategoryLandingPath('procesadores')).toBe('/comparar/procesadores');
    expect(buildCategoryLandingPath('fuentes-alimentacion')).toBe('/comparar/fuentes');
  });

  it('resuelve el slug de vuelta a su categoría', () => {
    expect(resolveCategoryFromLandingSlug('placas-de-video')).toBe('tarjetas-graficas');
    expect(resolveCategoryFromLandingSlug('procesadores')).toBe('procesadores');
  });

  it('rechaza slugs desconocidos en lugar de adivinar', () => {
    expect(resolveCategoryFromLandingSlug('tarjetas-graficas')).toBeNull();
    expect(resolveCategoryFromLandingSlug('no-existe')).toBeNull();
    expect(resolveCategoryFromLandingSlug('')).toBeNull();
  });

  it('expone la lista de slugs para prerenderizar', () => {
    expect(listCategoryLandingSlugs()).toHaveLength(categories.length);
    expect(listCategoryLandingSlugs()).toContain('placas-de-video');
  });

  it('hace ida y vuelta entre categoría, slug y ruta', () => {
    for (const category of categories) {
      const slug = CATEGORY_LANDING_SLUGS[category.id];
      expect(resolveCategoryFromLandingSlug(slug)).toBe(category.id);
      expect(buildCategoryLandingPath(category.id)).toBe(`/comparar/${slug}`);
    }
  });
});


describe('contrato de tipos', () => {
  it('mantiene el mapa exhaustivo frente a HardwareCategory', () => {
    const category: HardwareCategory = 'perifericos';
    expect(CATEGORY_LANDING_SLUGS[category]).toBe('perifericos');
  });
});

describe('redirección de las landings legadas /search?category=', () => {
  const redirectFor = (search: string) =>
    resolveLegacyCategoryLandingRedirect('/search', new URLSearchParams(search));

  it('manda la landing desnuda a su URL limpia, sin arrastrar el query', () => {
    expect(redirectFor('category=tarjetas-graficas')).toBe('/comparar/placas-de-video');
    expect(redirectFor('category=procesadores')).toBe('/comparar/procesadores');
  });

  it('cubre todas las categorías del catálogo', () => {
    for (const category of categories) {
      expect(redirectFor(`category=${category.id}`)).toBe(buildCategoryLandingPath(category.id));
    }
  });

  it('deja pasar la búsqueda con filtros para no romper el buscador', () => {
    expect(redirectFor('category=procesadores&page=2')).toBeNull();
    expect(redirectFor('category=procesadores&sortBy=price-asc')).toBeNull();
    expect(redirectFor('category=procesadores&stores=mexx')).toBeNull();
    expect(redirectFor('category=procesadores&q=ryzen')).toBeNull();
    expect(redirectFor('category=procesadores&minPrice=100')).toBeNull();
    expect(redirectFor('category=procesadores&maxPrice=900')).toBeNull();
  });

  it('ignora rutas que no son la búsqueda y categorías inválidas', () => {
    expect(resolveLegacyCategoryLandingRedirect('/comparar/procesadores', new URLSearchParams('category=procesadores'))).toBeNull();
    expect(resolveLegacyCategoryLandingRedirect('/', new URLSearchParams('category=procesadores'))).toBeNull();
    expect(redirectFor('category=no-existe')).toBeNull();
    expect(redirectFor('')).toBeNull();
  });

  it('no redirige un slug limpio usado como category', () => {
    expect(redirectFor('category=placas-de-video')).toBeNull();
  });
});
