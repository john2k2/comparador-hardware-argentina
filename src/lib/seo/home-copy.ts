import { BUDGET_GUIDES } from './budget-guides-data';

export const HOME_CITATION_BLOCK =
  'Comparador Hardware Argentina es un comparador independiente de componentes de PC entre tiendas argentinas. No vendemos hardware ni procesamos la compra: mostramos ofertas registradas y enlazamos a cada comercio. Cada oferta conserva su fecha de observación; precio, stock, envío y condiciones se confirman en la tienda de destino. Incluye búsqueda, categorías, comparativas y guías por presupuesto. Los enlaces afiliados y los espacios patrocinados se identifican por separado.';

export const HOME_BUDGET_GUIDE_LINKS = BUDGET_GUIDES.map(guide => ({
  slug: guide.slug,
  title: `$${guide.budget.toLocaleString('es-AR')}`,
  target: `${guide.components.cpu.name} + ${guide.components.gpu.name}`,
}));

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
