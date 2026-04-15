// ============================================
// SearchBar - Version Pixel Art Retro
// ============================================

'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
  value?: string;
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
  className,
  autoFocus = false,
  isLoading = false,
  loadingText = 'Consultando tiendas y precios...',
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const isControlled = value !== undefined;
  const query = isControlled ? value : internalQuery;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) {
      setInternalQuery(e.target.value);
    }
  };

  const handleClear = () => {
    if (!isControlled) {
      setInternalQuery('');
    }
    onSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('w-full', className)}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-4 bg-background px-4 py-3 transition-all',
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
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-busy={isLoading}
          aria-label="Buscar productos"
          className="flex-1 bg-transparent text-[12px] uppercase outline-none placeholder:text-foreground/70 placeholder:opacity-90 text-foreground tracking-wider"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isLoading}
            aria-label="Limpiar busqueda"
            className="text-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className={cn(
            'hidden sm:block bg-primary text-primary-foreground px-4 py-1 text-[10px] uppercase font-bold pixel-shadow transition-transform disabled:opacity-80 disabled:cursor-wait',
            isLoading
              ? 'animate-pulse'
              : 'active:translate-x-1 active:translate-y-1',
          )}
        >
          {isLoading ? 'BUSCANDO...' : 'SEARCH'}
        </button>
      </div>
      {isLoading && (
        <p
          className="mt-2 px-1 text-[8px] uppercase font-bold tracking-[0.18em] text-secondary animate-pulse"
          aria-live="polite"
        >
          {loadingText}
        </p>
      )}
    </form>
  );
}

export default SearchBar;
