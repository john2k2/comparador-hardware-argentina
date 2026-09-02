import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComparisonBenchSources } from '@/components/seo/ComparisonBenchSources';

describe('ComparisonBenchSources', () => {
  it('lista reviews de TechPowerUp con rel noopener y sin nofollow', () => {
    const markup = renderToStaticMarkup(
      createElement(ComparisonBenchSources, {
        sources: [
          {
            name: 'TechPowerUp — NVIDIA GeForce RTX 5070 Founders Edition (conclusión)',
            url: 'https://www.techpowerup.com/review/nvidia-geforce-rtx-5070-founders-edition/46.html',
          },
        ],
      }),
    );

    expect(markup).toContain('techpowerup.com/review/');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).not.toContain('nofollow');
    expect(markup).toMatch(/no copiamos/i);
  });
});
