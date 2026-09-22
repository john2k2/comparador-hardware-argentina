const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/**
 * Check if GA4 is configured and available
 */
function isGA4Available(): boolean {
  return Boolean(GA4_MEASUREMENT_ID && typeof window !== 'undefined' && typeof window.gtag === 'function');
}

function toAbsolutePageLocation(url: string): string {
  if (typeof window === 'undefined' || !window.location?.origin) return url;

  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return window.location.href;
  }
}

function toDestinationHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Track a pageview
 */
export function pageview(url: string): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'page_view', {
    page_location: toAbsolutePageLocation(url),
    page_title: typeof document === 'undefined' ? undefined : document.title,
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
  surface: 'search_results' | 'home_featured' | 'home_recent' | 'home_price_drop' | 'home_popular' | 'related_products' | 'store_landing';
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
 * Registra la intención de contacto sin enviar datos personales a Analytics.
 */
export function trackContactIntent(params: {
  purpose: 'support' | 'commercial' | 'pc_advisory';
  channel: 'email';
  surface: 'contact_page';
  ctaId?: string;
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'generate_lead', {
    lead_type: params.purpose,
    contact_channel: params.channel,
    contact_surface: params.surface,
    cta_id: params.ctaId,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/** Registra el paso hacia una consulta, antes de llegar al canal de contacto. */
export function trackAdvisoryCta(params: {
  surface: 'budget_builder' | 'budget_guide' | 'product_detail' | 'product_comparison';
  ctaId: string;
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'select_advisory_cta', {
    service_type: 'pc_advisory',
    cta_surface: params.surface,
    cta_id: params.ctaId,
    send_to: GA4_MEASUREMENT_ID,
  });
}

/** Registra el uso del armador sin enviar texto libre ni datos personales. */
export function trackBudgetBuilder(params: {
  source: 'manual' | 'preset';
  budget: number;
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'generate_pc_budget', {
    currency: 'ARS',
    value: params.budget,
    budget_source: params.source,
    send_to: GA4_MEASUREMENT_ID,
  });
}

export type PcBuilderAction = 'component_selected' | 'offer_selected' | 'saved' | 'restored'
  | 'share_link' | 'share_whatsapp' | 'download' | 'reset' | 'shared_opened'
  | 'refresh_requested' | 'refresh_result';

/** Mide acciones explícitas, sin enviar el enlace ni el contenido del presupuesto. */
export function trackPcBuilderAction(params: {
  action: PcBuilderAction;
  componentCount: number;
  complete: boolean;
  slot?: string;
  status?: string;
  updatedCount?: number;
}): void {
  if (!isGA4Available()) return;
  window.gtag('event', 'pc_builder_action', {
    builder_action: params.action,
    selected_components: params.componentCount,
    build_complete: params.complete,
    ...(params.slot ? { component_slot: params.slot } : {}),
    ...(params.status ? { refresh_status: params.status } : {}),
    ...(params.updatedCount !== undefined ? { updated_offers: params.updatedCount } : {}),
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
  category: string;
  ctaId: string;
  destinationUrl: string;
  surface: 'product_detail' | 'search_results' | 'home_section' | 'budget_guide' | 'budget_builder';
  linkType: 'organic' | 'sponsored';
}): void {
  if (!isGA4Available()) return;

  window.gtag('event', 'outbound_store_click', {
    currency: 'ARS',
    value: params.price,
    product_id: params.productId,
    product_name: params.productName,
    store_id: params.storeId,
    store_name: params.storeName,
    store_position: params.position,
    product_category: params.category,
    cta_id: params.ctaId,
    destination_host: toDestinationHost(params.destinationUrl),
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
