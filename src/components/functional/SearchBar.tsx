// ============================================
// SearchBar - Version Pixel Art Retro
// ============================================

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSuggestionProductHref, createSuggestionLoader, isSuggestionQuery, moveSuggestionIndex, normalizeSuggestionQuery, SUGGESTION_CATEGORY_LABELS, type SearchSuggestion } from '@/lib/search/search-suggestions';

export interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

export function SearchBar({
  onSearch,
  placeholder = 'BUSCAR...',
  initialValue = '',
  value,
  onValueChange,
  className,
  autoFocus = false,
  isLoading = false,
  loadingText = 'Consultando comercios...',
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<{ query: string; items: SearchSuggestion[] }>({ query: '', items: [] });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const router = useRouter();
  const listId = useId();
  const loader = useRef<ReturnType<typeof createSuggestionLoader> | null>(null);
  const isControlled = value !== undefined;
  const query = isControlled ? value : internalQuery;
  const normalizedQuery = normalizeSuggestionQuery(query);
  const items = isFocused && !isLoading && dismissedQuery !== normalizedQuery && suggestions.query === normalizedQuery ? suggestions.items : [];
  const popupOpen = items.length > 0;

  useEffect(() => {
    if (!isFocused || isLoading || !isSuggestionQuery(normalizedQuery) || dismissedQuery === normalizedQuery) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      loader.current ??= createSuggestionLoader();
      void loader.current(normalizedQuery, controller.signal).then((matches) => {
        if (!controller.signal.aborted) setSuggestions({ query: normalizedQuery, items: matches });
      }).catch(() => {
        if (!controller.signal.aborted) setSuggestions({ query: normalizedQuery, items: [] });
      });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [normalizedQuery, isFocused, isLoading, dismissedQuery]);

  const selectSuggestion = (item: SearchSuggestion) => {
    setDismissedQuery(normalizedQuery);
    setActiveIndex(-1);
    router.push(buildSuggestionProductHref(item.id, query, new URL(window.location.href)));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActiveIndex(-1);
    setDismissedQuery(null);
    onValueChange?.(e.target.value);
    if (!isControlled) {
      setInternalQuery(e.target.value);
    }
  };

  const handleClear = () => {
    setSuggestions({ query: '', items: [] });
    setActiveIndex(-1);
    setDismissedQuery(null);
    onValueChange?.('');
    if (!isControlled) {
      setInternalQuery('');
    }
    onSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDismissedQuery(normalizedQuery);
    onSearch(query);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('relative w-full', className)}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2 border-4 bg-background px-2 sm:px-4 py-2 sm:py-3 min-h-14 transition-all',
          isFocused
            ? 'border-secondary pixel-shadow'
            : 'border-border',
        )}
      >
        <Search
          className={cn(
            'h-5 w-5',
            isLoading
              ? 'text-secondary animate-pulse'
              : (isFocused ? 'text-secondary' : 'text-foreground'),
          )}
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { setIsFocused(true); setDismissedQuery(null); }}
          onBlur={() => { setIsFocused(false); setActiveIndex(-1); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') { setDismissedQuery(normalizedQuery); setActiveIndex(-1); return; }
            if (popupOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              setActiveIndex((index) => moveSuggestionIndex(index, event.key, items.length));
            } else if (popupOpen && event.key === 'Enter' && items[activeIndex]) {
              event.preventDefault();
              selectSuggestion(items[activeIndex]);
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={popupOpen}
          aria-controls={popupOpen ? listId : undefined}
          aria-activedescendant={popupOpen && items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-busy={isLoading}
          aria-label="Buscar productos"
          className="min-w-0 min-h-11 flex-1 bg-transparent text-base sm:min-h-0 sm:text-[14px] outline-none placeholder:text-foreground/70 placeholder:opacity-90 text-foreground tracking-normal"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isLoading}
            aria-label="Limpiar busqueda"
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className={cn(
            'inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground px-3 sm:px-4 py-3 min-h-11 min-w-11 text-[12px] uppercase font-bold pixel-shadow transition-transform disabled:opacity-80 disabled:cursor-wait',
            isLoading
              ? 'animate-pulse'
              : 'active:translate-x-1 active:translate-y-1',
          )}
        >
          <Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{isLoading ? 'BUSCANDO...' : 'BUSCAR'}</span>
        </button>
      </div>
      {popupOpen && <ul id={listId} role="listbox" aria-label="Sugerencias de productos"
        className="absolute top-full z-30 mt-1 w-full border-4 border-border bg-card pixel-shadow max-h-80 overflow-y-auto">
        {items.map((item, index) => <li key={item.id} role="presentation">
          <button id={`${listId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === activeIndex}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => selectSuggestion(item)}
            className={cn('flex w-full min-h-14 min-w-0 flex-col items-start gap-1 px-4 py-3 text-left font-mono text-sm normal-case leading-5 hover:bg-secondary/10', index === activeIndex && 'bg-secondary/10 text-secondary')}>
            <span className="line-clamp-2 break-words">{item.name}</span>
            <span className="text-xs text-muted-foreground">{SUGGESTION_CATEGORY_LABELS[item.category]}</span>
          </button>
        </li>)}
      </ul>}
      {isLoading && (
        <p
          className="mt-2 px-1 text-[12px] uppercase font-bold tracking-[0.18em] text-secondary animate-pulse"
          aria-live="polite"
        >
          {loadingText}
        </p>
      )}
    </form>
  );
}

export default SearchBar;
