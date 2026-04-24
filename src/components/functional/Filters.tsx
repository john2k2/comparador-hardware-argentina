// ============================================
// Filters - Componente de filtros (Retro Pixel Art)
// ============================================

'use client';

import { useState } from 'react';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HardwareCategory, SearchFilters, Store } from '@/lib/types';

export interface FiltersProps {
  filters: SearchFilters;
  onChange: (filters: Partial<SearchFilters>) => void;
  categories?: { id: HardwareCategory; name: string; slug: string }[];
  stores?: Store[];
  className?: string;
}

export function Filters({
  filters,
  onChange,
  categories = [],
  stores = [],
  className,
}: FiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['category', 'price', 'sort', 'stores']);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const handleCategoryChange = (category: string) => {
    onChange({ category: category as HardwareCategory | undefined });
  };

  const handlePriceChange = (type: 'min' | 'max', value: string) => {
    const numValue = value ? parseInt(value, 10) : undefined;
    onChange({
      minPrice: type === 'min' ? numValue : filters.minPrice,
      maxPrice: type === 'max' ? numValue : filters.maxPrice,
    });
  };

  const handleStoreToggle = (storeId: string) => {
    const currentStores = filters.stores || [];
    const newStores = currentStores.includes(storeId)
      ? currentStores.filter((s) => s !== storeId)
      : [...currentStores, storeId];
    onChange({ stores: newStores });
  };

  const handleSortChange = (value: string) => {
    onChange({
      sortBy: value as SearchFilters['sortBy'],
      sortOrder: value.includes('desc') ? 'desc' : 'asc',
    });
  };

  const handleClearFilters = () => {
    onChange({
      category: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      stores: [],
      sortBy: 'relevance',
    });
  };

  const activeFiltersCount = [
    filters.category,
    filters.minPrice,
    filters.maxPrice,
    filters.stores && filters.stores.length > 0,
  ].filter(Boolean).length;

  const categoryOptions = [
    { value: '', label: 'TODAS LAS CATEGORÍAS' },
    ...categories.map((c) => ({ value: c.id, label: c.name.toUpperCase() })),
  ];

  const sortOptions = [
    { value: 'relevance', label: 'MÁS RELEVANTES' },
    { value: 'price-asc', label: 'MENOR PRECIO' },
    { value: 'price-desc', label: 'MAYOR PRECIO' },
    { value: 'name', label: 'NOMBRE A-Z' },
    { value: 'newest', label: 'MÁS RECIENTES' },
  ];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header de filtros */}
      <div className="flex items-center justify-between border-b-4 border-muted pb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-foreground" />
          <span className="font-bold text-[10px] uppercase text-foreground">
            FILTROS
          </span>
          {activeFiltersCount > 0 && (
            <span className="bg-primary text-primary-foreground px-2 py-0.5 text-[8px] font-bold">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {activeFiltersCount > 0 && (
          <button
            onClick={handleClearFilters}
              className="min-h-11 px-2 text-[8px] uppercase text-muted-foreground hover:text-primary transition-colors"
            >
              [ LIMPIAR ]
            </button>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden min-h-11 text-[8px] uppercase bg-card border-2 border-border px-3 py-2 pixel-shadow"
          >
            {isOpen ? 'OCULTAR' : 'MOSTRAR'}
          </button>
        </div>
      </div>

      {/* Contenido de filtros */}
      <div
        className={cn(
          'space-y-6 lg:block',
          !isOpen && 'hidden'
        )}
      >
        {/* Ordenar por */}
        <div className="space-y-2">
          <button
            id="sort-filter-label"
            onClick={() => toggleSection('sort')}
            className="min-h-11 flex items-center justify-between w-full text-[10px] font-bold text-foreground uppercase tracking-wider"
          >
            ORDENAR POR
            {expandedSections.includes('sort') ? (
              <ChevronUp className="h-4 w-4 text-primary" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {expandedSections.includes('sort') && (
            <select
              value={filters.sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              aria-labelledby="sort-filter-label"
              className="w-full min-h-11 px-2 border-4 border-border bg-background text-foreground text-[8px] uppercase outline-none focus:border-primary appearance-none rounded-none"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Categoría */}
        <div className="space-y-2">
          <button
            id="category-filter-label"
            onClick={() => toggleSection('category')}
            className="min-h-11 flex items-center justify-between w-full text-[10px] font-bold text-foreground uppercase tracking-wider"
          >
            CATEGORÍA
            {expandedSections.includes('category') ? (
              <ChevronUp className="h-4 w-4 text-primary" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {expandedSections.includes('category') && (
            <select
              value={filters.category || ''}
              onChange={(e) => handleCategoryChange(e.target.value)}
              aria-labelledby="category-filter-label"
              className="w-full min-h-11 px-2 border-4 border-border bg-background text-foreground text-[8px] uppercase outline-none focus:border-primary appearance-none rounded-none"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Rango de precio */}
        <div className="space-y-2">
          <button
            onClick={() => toggleSection('price')}
            className="min-h-11 flex items-center justify-between w-full text-[10px] font-bold text-foreground uppercase tracking-wider"
          >
            RANGO PRECIO
            {expandedSections.includes('price') ? (
              <ChevronUp className="h-4 w-4 text-primary" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {expandedSections.includes('price') && (
            <div className="flex gap-2">
              <label className="sr-only">Precio mínimo</label>
              <input
                type="number"
                placeholder="MIN"
                value={filters.minPrice || ''}
                onChange={(e) => handlePriceChange('min', e.target.value)}
                aria-label="Precio mínimo"
                className="w-full min-h-11 px-2 border-4 border-border bg-background text-foreground text-[10px] outline-none focus:border-primary placeholder:text-muted-foreground rounded-none"
              />
              <label className="sr-only">Precio máximo</label>
              <input
                type="number"
                placeholder="MAX"
                value={filters.maxPrice || ''}
                onChange={(e) => handlePriceChange('max', e.target.value)}
                aria-label="Precio máximo"
                className="w-full min-h-11 px-2 border-4 border-border bg-background text-foreground text-[10px] outline-none focus:border-primary placeholder:text-muted-foreground rounded-none"
              />
            </div>
          )}
        </div>

        {/* Tiendas */}
        {stores.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => toggleSection('stores')}
              className="min-h-11 flex items-center justify-between w-full text-[10px] font-bold text-foreground uppercase tracking-wider"
            >
              TIENDAS
              {expandedSections.includes('stores') ? (
                <ChevronUp className="h-4 w-4 text-primary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {expandedSections.includes('stores') && (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2 scrollbar-thin">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => handleStoreToggle(store.id)}
                    className={cn(
                      'text-left px-2 py-1 text-[8px] uppercase transition-colors border-2 shrink-0',
                      'min-h-11',
                      filters.stores?.includes(store.id)
                        ? 'bg-secondary text-secondary-foreground border-secondary font-bold'
                        : 'bg-background text-muted-foreground border-transparent hover:border-border'
                    )}
                  >
                    {filters.stores?.includes(store.id) ? '[X] ' : '[ ] '}
                    {store.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Filters;
