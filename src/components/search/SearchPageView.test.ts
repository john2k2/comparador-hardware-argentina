import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PaginationControls } from './SearchPageView';

describe('search pagination controls', () => {
  it('renders crawlable previous and next links with preserved filters', () => {
    const markup = renderToStaticMarkup(createElement(PaginationControls, {
      currentPage: 2,
      totalPages: 4,
      isBusy: false,
      searchRoute: '/search?category=procesadores&stores=mexx%2Cvenex&page=2',
      onPageChange: vi.fn(),
    }));

    expect(markup).toContain('href="/search?category=procesadores&amp;stores=mexx%2Cvenex"');
    expect(markup).toContain('href="/search?category=procesadores&amp;stores=mexx%2Cvenex&amp;page=3"');
  });

  it('keeps the previous page crawlable on the final page', () => {
    const markup = renderToStaticMarkup(createElement(PaginationControls, {
      currentPage: 4,
      totalPages: 4,
      isBusy: false,
      searchRoute: '/search?category=procesadores&page=4',
      onPageChange: vi.fn(),
    }));

    expect(markup).toContain('href="/search?category=procesadores&amp;page=3"');
  });

  it('anuncia la página actual en español dentro de una navegación', () => {
    const markup = renderToStaticMarkup(createElement(PaginationControls, {
      currentPage: 2,
      totalPages: 4,
      isBusy: false,
      searchRoute: '/search?q=ryzen&page=2',
      onPageChange: vi.fn(),
    }));

    expect(markup).toContain('<nav aria-label="Paginación de resultados"');
    expect(markup).toContain('<span class="sr-only">Página 2 de 4</span>');
    expect(markup).toMatch(/<span aria-hidden="true"><span class="hidden sm:inline">NIVEL<\/span> 2 \/ 4<\/span>/);
  });
});
