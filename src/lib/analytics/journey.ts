/** Contrato compartido del panel: etapas agregadas, no un embudo secuencial de personas. */
export const JOURNEY_EVENTS = [
  { key: 'search', event: 'search', label: 'Búsquedas' },
  { key: 'productView', event: 'view_item', label: 'Vistas de producto' },
  { key: 'comparison', event: 'comparison_result', label: 'Comparaciones resueltas' },
  { key: 'comparisonOpen', event: 'comparison_product_open', label: 'Aperturas desde una comparación' },
  { key: 'outbound', event: 'outbound_store_click', label: 'Clics hacia tiendas' },
  { key: 'budgetSuggestion', event: 'generate_pc_budget', label: 'Sugerencias del armador · pueden ser parciales' },
  { key: 'builderAction', event: 'pc_builder_action', label: 'Acciones del armador · total' },
] as const;

/** Nombres fijos: permiten leer acciones sin registrar dimensiones personalizadas en Google. */
export const BUILDER_DETAIL_EVENTS = [
  { key: 'builderComponent', event: 'pc_builder_component_selected', action: 'component_selected', label: 'Selecciones de piezas' },
  { key: 'builderOffer', event: 'pc_builder_offer_selected', action: 'offer_selected', label: 'Selecciones de ofertas' },
  { key: 'builderSaved', event: 'pc_builder_saved', action: 'saved', label: 'Armados guardados' },
  { key: 'builderRestored', event: 'pc_builder_restored', action: 'restored', label: 'Armados recuperados' },
  { key: 'builderShareLink', event: 'pc_builder_share_link', action: 'share_link', label: 'Solicitudes de enlace para compartir' },
  { key: 'builderShareWhatsapp', event: 'pc_builder_share_whatsapp', action: 'share_whatsapp', label: 'Aperturas para compartir por WhatsApp' },
  { key: 'builderDownload', event: 'pc_builder_download', action: 'download', label: 'Solicitudes de descarga' },
  { key: 'builderCompleteAction', event: 'pc_builder_complete_action', action: null, label: 'Acciones con armado completo y envío informado' },
] as const;

export const ALL_JOURNEY_EVENTS = [...JOURNEY_EVENTS, ...BUILDER_DETAIL_EVENTS];
export const JOURNEY_METRIC_KEYS = ALL_JOURNEY_EVENTS.flatMap(({ key }) => [`${key}Events`, `${key}Users`]);
