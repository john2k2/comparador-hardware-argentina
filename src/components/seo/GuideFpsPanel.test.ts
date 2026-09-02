import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuideFpsPanel } from '@/components/seo/GuideFpsPanel';

const games = [{ game: 'Fortnite', fps: '120+', settings: '1080p High' }];

describe('GuideFpsPanel', () => {
  it('oculta números de FPS si CPU o GPU no están en stock', () => {
    const markup = renderToStaticMarkup(createElement(GuideFpsPanel, { canPublish: false, games }));

    expect(markup).not.toContain('120+');
    expect(markup).not.toContain('Fortnite');
    expect(markup).toMatch(/no publicamos FPS/i);
  });

  it('lista FPS solo cuando el combo está en catálogo', () => {
    const markup = renderToStaticMarkup(createElement(GuideFpsPanel, { canPublish: true, games }));

    expect(markup).toContain('Fortnite');
    expect(markup).toContain('120+');
  });
});
