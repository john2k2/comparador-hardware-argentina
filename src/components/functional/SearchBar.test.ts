import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { SearchBar } from './SearchBar';

describe('contrato inicial del buscador compartido', () => {
  it('mantiene búsqueda explícita y el combobox cerrado antes de una consulta enfocada', () => {
    const onSearch = vi.fn();
    const $ = load(renderToStaticMarkup(createElement(SearchBar, { onSearch, initialValue: 'Ryzen' })));
    const input = $('input');
    expect(input.attr('role')).toBe('combobox');
    expect(input.attr('aria-expanded')).toBe('false');
    expect(input.attr('value')).toBe('Ryzen');
    expect($('button[type="submit"]')).toHaveLength(1);
    expect($('[role="listbox"]')).toHaveLength(0);
    expect(onSearch).not.toHaveBeenCalled();
  });
});
