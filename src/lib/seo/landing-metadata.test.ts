import { describe, expect, it } from 'vitest';
import { EDITORIAL_UPDATED_AT } from './editorial-freshness';
import {
  resolveArmarPcMetadata,
  resolveComparativasHubMetadata,
  resolveComparisonPageMetadata,
  resolveGuiasHubMetadata,
  resolveGuidePageMetadata,
} from './landing-metadata';

describe('landing metadata dates', () => {
  it('publica dateModified ISO en Open Graph de comparativa y guía', () => {
    const comparison = resolveComparisonPageMetadata('rtx-4060-vs-rx-7600');
    const guide = resolveGuidePageMetadata('pc-gamer-1-millon');

    expect(comparison.openGraph).toMatchObject({
      type: 'article',
      modifiedTime: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
    });
    expect(guide.openGraph).toMatchObject({
      type: 'article',
      modifiedTime: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
    });
  });

  it('usa og:article en los hubs para poder publicar modifiedTime', () => {
    expect(resolveComparativasHubMetadata().openGraph).toMatchObject({
      type: 'article',
      modifiedTime: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
    });
    expect(resolveGuiasHubMetadata().openGraph).toMatchObject({
      type: 'article',
      modifiedTime: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
    });
  });

  it('indexa el formulario de armar PC y noindexea un presupuesto concreto', () => {
    expect(resolveArmarPcMetadata().robots).toBeUndefined();
    expect(resolveArmarPcMetadata('1500000').robots).toMatchObject({ index: false, follow: true });
    expect(resolveArmarPcMetadata('1500000').alternates).toMatchObject({
      canonical: 'https://www.comparador-hardware.com.ar/guia/armar',
    });
  });
});
