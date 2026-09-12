import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuideFpsPanel } from '@/components/seo/GuideFpsPanel';

describe('GuideFpsPanel', () => {
  it('no publica FPS sin un benchmark verificable del SKU exacto', () => {
    const markup = renderToStaticMarkup(createElement(GuideFpsPanel));

    expect(markup).toMatch(/no publicamos FPS estimados/i);
    expect(markup).toMatch(/SKU exacto/i);
  });
});
