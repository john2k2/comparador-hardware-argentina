// ============================================
// Types - Tipos para el comparador de hardware
// ============================================

// Categorías de hardware
export type HardwareCategory = 
  | 'procesadores'
  | 'tarjetas-graficas'
  | 'motherboards'
  | 'memoria-ram'
  | 'almacenamiento'
  | 'fuentes-alimentacion'
  | 'gabinetes'
  | 'refrigeracion'
  | 'perifericos';

// Tiendas disponibles
export interface Store {
  id: string;
  name: string;
  logo: string;
  url: string;
  color: string;
}

// Precio en ARS con información de cuotas
export interface PriceInfo {
  amount: number;
  currency: string;
  installments: InstallmentInfo[];
  discount?: number;
  lastUpdated: Date;
}

export interface InstallmentInfo {
  count: number;
  amount: number;
  totalAmount: number;
  interest: boolean;
}

// Producto con precios de múltiples tiendas
export interface Product {
  id: string;
  name: string;
  category: HardwareCategory;
  brand: string;
  model: string;
  description?: string;
  image?: string;
  normalizedTitle?: string;
  canonicalProductKey?: string;
  familyKey?: string;
  variantKey?: string;
  refreshPriority?: RefreshPriority;
  lastScrapedAt?: Date;
  lastNormalizedAt?: Date | null;
  specs: Record<string, string>;
  prices: ProductPrice[];
  lowestPrice: number;
  highestPrice: number;
  averagePrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductPrice {
  storeId: string;
  storeName: string;
  url: string;
  price: number;
  originalPrice?: number;
  stock: StockStatus;
  installment: InstallmentInfo | null;
  lastUpdated: Date;
}

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock' | 'unknown';
export type RefreshPriority = 'tracked' | 'hot' | 'normal' | 'cold';

// Búsqueda y filtros
export interface SearchFilters {
  query: string;
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  stores?: string[];
  brands?: string[];
  sortBy: SortOption;
  sortOrder: 'asc' | 'desc';
}

export type SortOption = 
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'name'
  | 'newest';

// Resultados de búsqueda
export interface SearchResult {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  facets: SearchFacets;
}

export interface SearchFacets {
  categories: FacetItem[];
  brands: FacetItem[];
  stores: FacetItem[];
  priceRanges: FacetItem[];
}

export interface FacetItem {
  value: string;
  count: number;
  label: string;
}

// Páginas de detalle
export interface ProductDetail extends Product {
  priceHistory: PriceHistoryPoint[];
  alternatives: Product[];
  relatedProducts: Product[];
}

export interface PriceHistoryPoint {
  date: Date;
  price: number;
  storeId: string;
}

// Tipos para scraping
export interface ScraperConfig {
  storeId: string;
  name: string;
  baseUrl: string;
  selectors: ScraperSelectors;
  pagination?: ScraperPagination;
}

export interface ScraperSelectors {
  productList: string;
  productCard: string;
  productName: string;
  productPrice: string;
  productImage: string;
  productUrl: string;
  productStock: string;
  nextPage?: string;
}

export interface ScraperPagination {
  type: 'offset' | 'page' | 'cursor';
  offsetParam?: string;
  pageParam?: string;
  limit?: number;
}

// Configuración de la aplicación
export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  stores: Store[];
  categories: CategoryConfig[];
}

export interface CategoryConfig {
  id: HardwareCategory;
  name: string;
  icon: string;
  slug: string;
  parentCategory?: HardwareCategory;
}
