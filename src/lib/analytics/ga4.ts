const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

/**
 * Check if GA4 is configured and available
 */
function isGA4Available(): boolean {
  return Boolean(GA4_MEASUREMENT_ID && typeof window !== 'undefined' && typeof window.gtag === 'function');
}

/**
 * Track a pageview
 */
export function pageview(url: string): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'page_view', {
    page_location: url,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/**
 * Track a search event
 */
export function trackSearch(params: {
  searchTerm?: string;
  category?: string;
  resultCount: number;
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'search', {
    search_term: params.searchTerm || '',
    search_category: params.category || 'all',
    number_of_results: params.resultCount,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/**
 * Track a product view event
 */
export function trackProductView(params: {
  productId: string;
  productName: string;
  category: string;
  brand?: string;
  price?: number;
  storeCount: number;
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'view_item', {
    currency: 'ARS',
    value: params.price || 0,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        item_category: params.category,
        item_brand: params.brand || '',
        quantity: 1,
      },
    ],
    send_to: GA4_MEASUREMENT_ID,
  });
}

/**
 * Track a click from a product listing into detail
 */
export function trackProductSelection(params: {
  productId: string;
  productName: string;
  category: string;
  brand?: string;
  price?: number;
  position: number;
  surface: 'search_results' | 'home_featured' | 'home_recent' | 'home_price_drop' | 'related_products';
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'select_item', {
    currency: 'ARS',
    value: params.price || 0,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        item_category: params.category,
        item_brand: params.brand || '',
        quantity: 1,
        item_list_name: params.surface,
        item_list_id: params.surface,
        index: params.position,
      },
    ],
    selection_surface: params.surface,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/**
 * Track an explicitly sponsored store slot click
 */
export function trackSponsoredStoreSelection(params: {
  storeId: string;
  storeName: string;
  position: number;
  surface: 'home_sponsored';
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'select_promotion', {
    creative_slot: String(params.position),
    promotion_id: params.storeId,
    promotion_name: params.storeName,
    promotion_surface: params.surface,
    items: [
      {
        item_id: params.storeId,
        item_name: params.storeName,
        item_category: 'store_promotion',
        index: params.position,
      },
    ],
    send_to: GA4_MEASUREMENT_ID,
  });
}

/**
 * Track a click to external store
 */
export function trackStoreClick(params: {
  productId: string;
  productName: string;
  storeName: string;
  storeId: string;
  price: number;
  position: number;
  surface: 'product_detail' | 'search_results' | 'home_section';
  linkType: 'organic' | 'sponsored';
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'select_item', {
    currency: 'ARS',
    value: params.price,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        item_category: 'hardware',
        item_brand: '',
        quantity: 1,
        item_list_name: 'store_prices',
        item_list_id: params.storeId,
        promotion_name: params.storeName,
        promotion_id: params.storeId,
        creative_name: `position_${params.position}`,
        creative_slot: String(params.position),
      },
    ],
    outbound_surface: params.surface,
    outbound_link_type: params.linkType,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/**
 * Track filter changes
 */
export function trackFilterChange(params: {
  filterType: 'category' | 'price_range' | 'store' | 'sort';
  filterValue: string;
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'filter_hardware', {
    filter_type: params.filterType,
    filter_value: params.filterValue,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/**
 * Track a generic event
 */
export function trackEvent(eventName: string, additionalParams?: Record<string, unknown>): void {
  if (!isGA4Available()) return;

  window.gtag('event', eventName, {
    ...additionalParams,
    send_to: GA4_MEASUREMENT_ID,
  });
}
