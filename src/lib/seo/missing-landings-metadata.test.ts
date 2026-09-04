import { describe, expect, it } from 'vitest';
import { metadata as notFoundMetadata } from '@/app/not-found';
import {
  resolveCategoryLandingPageMetadata,
  resolveComparisonPageMetadata,
  resolveGuidePageMetadata,
} from './landing-metadata';

describe('missing public landings metadata', () => {
  it('noindexa el 404 con copy distinta a la home', () => {
    expect(notFoundMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(String(notFoundMetadata.description ?? '')).not.toMatch(/30%/);
    expect(String(notFoundMetadata.description ?? '').toLowerCase()).not.toContain('ahorra');
  });

  it('noindexa slugs de guía inválidos antes de notFound', () => {
    const metadata = resolveGuidePageMetadata('pc-gamer-1-5-millones');

    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.title).toBe('Guía no encontrada');
  });

  it('noindexa slugs de comparativa inválidos antes de notFound', () => {
    const metadata = resolveComparisonPageMetadata('no-existe');

    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.title).toBe('Comparativa no encontrada');
  });

  it('noindexa slugs de categoría inválidos antes de notFound', () => {
    const metadata = resolveCategoryLandingPageMetadata('tarjetas-graficas');

    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.title).toBe('Categoría no encontrada');
  });

  it('indexa la landing de categoría válida con su canonical limpio', () => {
    const metadata = resolveCategoryLandingPageMetadata('placas-de-video');

    expect(metadata.robots).toMatchObject({ index: true });
    expect(String(metadata.alternates?.canonical)).toContain('/comparar/placas-de-video');
  });
});
